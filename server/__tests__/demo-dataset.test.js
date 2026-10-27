/**
 * @file Tests for the demo dataset behind `npm run seed:demo`: several fictional
 * projects and branches across Claude Code, Codex and Cursor, live / waiting /
 * error / finished sessions, transcripts with compactions written only to the
 * dashboard's own snapshot directory, outliers the session diagnostic flags,
 * and an idempotent re-run.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");

const TMP = path.join(os.tmpdir(), `demo-dataset-${Date.now()}-${process.pid}`);
fs.mkdirSync(TMP, { recursive: true });
process.env.DASHBOARD_DB_PATH = path.join(TMP, "dashboard.db");
process.env.CLAUDE_HOME = path.join(TMP, "home");
process.env.DASHBOARD_DATA_DIR = path.join(TMP, "data");

const { db } = require("../db");
const { seedDemoDataset, DEMO_PREFIX } = require("../../scripts/demo-dataset");
const { readContextTimeline } = require("../lib/context-timeline");
const { buildDiagnostic, collectSessionMetrics } = require("../lib/session-diagnostic");

const SNAPSHOT_DIR = path.join(TMP, "snapshots");
let firstRun;

before(() => {
  firstRun = seedDemoDataset({ db, snapshotDir: SNAPSHOT_DIR });
});

after(() => {
  db.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

function demoSessions() {
  return db.prepare("SELECT * FROM sessions WHERE id LIKE ?").all(`${DEMO_PREFIX}%`);
}

describe("seedDemoDataset", () => {
  it("spreads sessions over several projects and the three providers", () => {
    const sessions = demoSessions();
    assert.ok(sessions.length >= 20, `expected >= 20 sessions, got ${sessions.length}`);
    assert.ok(new Set(sessions.map((s) => s.cwd)).size >= 5);
    assert.deepEqual([...new Set(sessions.map((s) => s.provider))].sort(), [
      "claude",
      "codex",
      "cursor",
    ]);
  });

  it("has live, waiting and errored sessions", () => {
    const sessions = demoSessions();
    assert.ok(sessions.filter((s) => s.status === "active").length >= 4);
    assert.ok(sessions.some((s) => s.awaiting_input_since));
    assert.ok(sessions.some((s) => s.status === "error"));
  });

  it("writes transcripts with compactions under the snapshot directory only", async () => {
    assert.ok(firstRun.transcripts.length >= 2);
    for (const file of firstRun.transcripts) {
      assert.ok(file.startsWith(SNAPSHOT_DIR), `${file} must live in the snapshot dir`);
    }
    const { points, compactions } = await readContextTimeline(firstRun.transcripts[0]);
    assert.ok(points.length >= 30);
    assert.ok(compactions.length >= 2);
    for (const compaction of compactions) {
      assert.ok(compaction.post_tokens < compaction.pre_tokens);
    }
  });

  it("gives the session diagnostic outliers to flag", () => {
    const diagnostic = buildDiagnostic(collectSessionMetrics(db, { days: 30 }));
    const flaggedDemo = diagnostic.sessions.filter((s) => s.id.startsWith(DEMO_PREFIX));
    assert.ok(flaggedDemo.length >= 2, `expected >= 2 flagged demo sessions`);
  });

  it("is idempotent", () => {
    const before = demoSessions().length;
    const second = seedDemoDataset({ db, snapshotDir: SNAPSHOT_DIR });
    assert.equal(second.inserted, 0);
    assert.equal(demoSessions().length, before);
  });
});
