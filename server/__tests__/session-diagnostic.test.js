/**
 * @file Tests for the session diagnostic: percentile math, per-metric
 * thresholds (max of the user's own P90 and a fixed guardrail), flagging and
 * ordering of atypical sessions, the metrics collected from SQLite (tokens
 * with compaction baselines, compactions, tool calls, finished sessions only)
 * and GET /api/analytics/diagnostic.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

const TMP = path.join(os.tmpdir(), `session-diagnostic-${Date.now()}-${process.pid}`);
fs.mkdirSync(TMP, { recursive: true });
process.env.DASHBOARD_DB_PATH = path.join(TMP, "dashboard.db");
process.env.CLAUDE_HOME = path.join(TMP, "home");
process.env.DASHBOARD_DATA_DIR = path.join(TMP, "data");

const { createApp, startServer } = require("../index");
const { db } = require("../db");
const {
  percentile,
  buildDiagnostic,
  collectSessionMetrics,
  GUARDRAILS,
} = require("../lib/session-diagnostic");

function metrics(overrides) {
  return {
    id: overrides.id,
    name: overrides.id,
    started_at: "2026-10-20T10:00:00.000Z",
    provider: "claude",
    cost: 0.1,
    tokens: 1000,
    duration_min: 5,
    compactions: 0,
    tool_calls: 10,
    ...overrides,
  };
}

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();

function seedSession(id, { status = "completed", startedHoursAgo = 2, minutes = 10 } = {}) {
  db.prepare(
    "INSERT INTO sessions (id, name, status, provider, started_at, ended_at) VALUES (?, ?, ?, 'claude', ?, ?)"
  ).run(
    id,
    id,
    status,
    hoursAgo(startedHoursAgo),
    status === "active" ? null : hoursAgo(startedHoursAgo - minutes / 60)
  );
}

describe("percentile", () => {
  it("percentile of 1..10 at 0.9 is 9.1", () => {
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9.1);
  });
});

describe("buildDiagnostic", () => {
  const sample = Array.from({ length: 12 }, (_, i) => metrics({ id: `s${i}`, tool_calls: 10 }));

  it("threshold is the guardrail when P90 is lower", () => {
    const { thresholds } = buildDiagnostic(sample);
    assert.equal(thresholds.tool_calls.p90, 10);
    assert.equal(thresholds.tool_calls.threshold, GUARDRAILS.tool_calls);
  });

  it("threshold is the P90 when it is above the guardrail", () => {
    const heavy = Array.from({ length: 12 }, (_, i) =>
      metrics({ id: `h${i}`, tool_calls: 300 + i * 100 })
    );
    const { thresholds } = buildDiagnostic(heavy);
    assert.ok(thresholds.tool_calls.threshold > GUARDRAILS.tool_calls);
    assert.equal(thresholds.tool_calls.threshold, thresholds.tool_calls.p90);
  });

  it("uses guardrails only below 10 sessions and says so in limits", () => {
    const { thresholds, limits } = buildDiagnostic(sample.slice(0, 5));
    assert.equal(thresholds.cost.p90, null);
    assert.equal(thresholds.cost.threshold, GUARDRAILS.cost);
    assert.ok(limits.includes("small_sample"));
  });

  it("flags a session per exceeded metric and marks cost as estimated", () => {
    const outlier = metrics({ id: "big", cost: 5, tool_calls: 900 });
    const { sessions } = buildDiagnostic([...sample, outlier]);
    assert.equal(sessions.length, 1);
    const flags = Object.fromEntries(sessions[0].flags.map((f) => [f.metric, f]));
    assert.equal(flags.cost.kind, "estimated");
    assert.equal(flags.tool_calls.kind, "measured");
    assert.equal(flags.cost.value, 5);
    assert.equal(flags.cost.ratio, 5);
  });

  it("sessions sorted by highest ratio", () => {
    const mild = metrics({ id: "mild", cost: 1.5 });
    const wild = metrics({ id: "wild", cost: 9 });
    const { sessions } = buildDiagnostic([...sample, mild, wild]);
    assert.deepEqual(
      sessions.map((s) => s.id),
      ["wild", "mild"]
    );
  });

  it("limits always mention unmeasured tool errors", () => {
    assert.ok(buildDiagnostic(sample).limits.includes("tool_errors_not_captured"));
  });
});

describe("collectSessionMetrics", () => {
  before(() => {
    seedSession("done-1", { minutes: 45 });
    seedSession("live-1", { status: "active" });
    seedSession("old-1", { startedHoursAgo: 24 * 60 });
    db.prepare(
      `INSERT INTO token_usage (session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, baseline_input, baseline_cache_read)
       VALUES ('done-1', 'claude-opus-5-5', 100, 50, 1000, 10, 900, 2000)`
    ).run();
    db.prepare(
      "INSERT INTO agents (id, session_id, name, type, subagent_type, status) VALUES ('done-1-compact-a', 'done-1', 'Context Compaction', 'subagent', 'compaction', 'completed')"
    ).run();
    const insertEvent = db.prepare(
      "INSERT INTO events (session_id, event_type, tool_name) VALUES ('done-1', ?, 'Bash')"
    );
    insertEvent.run("PreToolUse");
    insertEvent.run("PreToolUse");
    insertEvent.run("PostToolUse");
  });

  it("tokens include baselines", () => {
    const rows = collectSessionMetrics(db, { days: 30 });
    const done = rows.find((r) => r.id === "done-1");
    assert.equal(done.tokens, 100 + 900 + 50 + 1000 + 2000 + 10);
    assert.equal(done.compactions, 1);
    assert.equal(done.tool_calls, 2);
    assert.equal(Math.round(done.duration_min), 45);
    assert.ok(done.cost > 0);
  });

  it("excludes active sessions and sessions outside the period", () => {
    const ids = collectSessionMetrics(db, { days: 30 }).map((r) => r.id);
    assert.ok(!ids.includes("live-1"));
    assert.ok(!ids.includes("old-1"));
  });
});

describe("GET /api/analytics/diagnostic", () => {
  let server;
  let base;
  before(async () => {
    server = await startServer(createApp(), 0);
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => {
    if (server) server.close();
    if (db) db.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it("returns thresholds, flagged sessions and limits", async () => {
    const body = await new Promise((resolve, reject) => {
      http
        .get(`${base}/api/analytics/diagnostic?days=30`, (res) => {
          let raw = "";
          res.on("data", (c) => (raw += c));
          res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(raw) }));
        })
        .on("error", reject);
    });
    assert.equal(body.status, 200);
    assert.equal(body.json.period_days, 30);
    assert.equal(body.json.sample_size, 1);
    assert.ok(body.json.thresholds.cost);
    assert.ok(Array.isArray(body.json.sessions));
    assert.ok(body.json.limits.includes("small_sample"));
  });
});
