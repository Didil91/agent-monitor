/**
 * @file Tests for compaction surfacing in GET /:id/transcript: a
 * `system`/`compact_boundary` line becomes a `session_event` marker carrying
 * the trigger, pre-compaction tokens and duration, and the `isCompactSummary`
 * user line that follows is flagged as a compaction summary attributed to the
 * system, not to the human.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

const STAMP = `transcript-compaction-${Date.now()}-${process.pid}`;
const TMP = path.join(os.tmpdir(), STAMP);
const CLAUDE_HOME = path.join(TMP, "home");
process.env.DASHBOARD_DB_PATH = path.join(TMP, "dashboard.db");
process.env.CLAUDE_HOME = CLAUDE_HOME;
process.env.DASHBOARD_DATA_DIR = path.join(TMP, "data");

const { createApp, startServer } = require("../index");
const { db } = require("../db");

const enc = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, "-");

function writeTranscript(cwd, sessionId, lines) {
  const p = path.join(CLAUDE_HOME, "projects", enc(cwd), `${sessionId}.jsonl`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, lines.map((o) => JSON.stringify(o)).join("\n") + "\n");
  return p;
}

let server;
let BASE;

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(b || "{}") }));
      }
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

before(async () => {
  server = await startServer(createApp(), 0);
  BASE = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  if (server) server.close();
  if (db) db.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("GET /:id/transcript — compactions", () => {
  const cwd = "/tmp/cam-compaction-marker";
  const sid = "c0ffee00-0000-1111-2222-333333333333";

  before(async () => {
    writeTranscript(cwd, sid, [
      { type: "user", message: { role: "user", content: "start" } },
      {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "ok" }] },
      },
      {
        type: "system",
        subtype: "compact_boundary",
        content: "Conversation compacted",
        timestamp: "2026-10-24T10:24:55.376Z",
        uuid: "boundary-1",
        compactMetadata: { trigger: "auto", preTokens: 691105, durationMs: 82343 },
      },
      {
        type: "user",
        isCompactSummary: true,
        message: { role: "user", content: "This session is being continued… summary" },
      },
    ]);
    await req("POST", "/api/sessions", { id: sid, cwd });
  });

  it("compact_boundary yields a compaction session_event", async () => {
    const res = await req("GET", `/api/sessions/${sid}/transcript?limit=200`);
    const marker = res.body.messages.find(
      (m) => m.type === "session_event" && m.event_kind === "compaction"
    );
    assert.ok(marker, "compaction marker present");
    assert.equal(marker.trigger, "auto");
    assert.equal(marker.pre_tokens, 691105);
    assert.equal(marker.duration_ms, 82343);
    assert.equal(marker.timestamp, "2026-10-24T10:24:55.376Z");
  });

  it("compact summary is flagged and not attributed to the user", async () => {
    const res = await req("GET", `/api/sessions/${sid}/transcript?limit=200`);
    const summary = res.body.messages.find((m) => m.compact_summary === true);
    assert.ok(summary, "summary flagged");
    assert.equal(summary.sender, "system");
    assert.match(summary.content[0].text, /summary/);
  });
});
