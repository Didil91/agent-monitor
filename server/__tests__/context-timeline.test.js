/**
 * @file Tests for the context-window timeline: readContextTimeline() turns a
 * Claude Code JSONL transcript into per-turn context sizes plus a detail row
 * per compaction, and GET /api/sessions/:id/context-timeline serves it.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

const STAMP = `context-timeline-${Date.now()}-${process.pid}`;
const TMP = path.join(os.tmpdir(), STAMP);
const CLAUDE_HOME = path.join(TMP, "home");
process.env.DASHBOARD_DB_PATH = path.join(TMP, "dashboard.db");
process.env.CLAUDE_HOME = CLAUDE_HOME;
process.env.DASHBOARD_DATA_DIR = path.join(TMP, "data");

const { createApp, startServer } = require("../index");
const { db } = require("../db");
const { readContextTimeline } = require("../lib/context-timeline");

const enc = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, "-");

function writeTranscript(cwd, sessionId, lines) {
  const p = path.join(CLAUDE_HOME, "projects", enc(cwd), `${sessionId}.jsonl`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    lines.map((o) => (typeof o === "string" ? o : JSON.stringify(o))).join("\n") + "\n"
  );
  return p;
}

const user = (text) => ({ type: "user", message: { role: "user", content: text } });
const assistant = (id, usage, timestamp = null) => ({
  type: "assistant",
  timestamp,
  message: { id, role: "assistant", content: [{ type: "text", text: "ok" }], usage },
});
const boundary = (uuid, preTokens) => ({
  type: "system",
  subtype: "compact_boundary",
  uuid,
  timestamp: "2026-10-24T10:24:55.376Z",
  compactMetadata: { trigger: "manual", preTokens, durationMs: 4000 },
});
const usage = (input, cacheRead = 0, cacheCreation = 0) => ({
  input_tokens: input,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheCreation,
  output_tokens: 5,
});

let server;
let BASE;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get(new URL(urlPath, BASE), (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(b || "{}") }));
      })
      .on("error", reject);
  });
}

function post(urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const payload = JSON.stringify(body);
    const r = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.resume();
        res.on("end", resolve);
      }
    );
    r.on("error", reject);
    r.write(payload);
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

describe("readContextTimeline", () => {
  it("counts each assistant message.id once", async () => {
    const p = writeTranscript("/tmp/ctx-dedupe", "dedupe", [
      user("hi"),
      assistant("msg_1", usage(10)),
      assistant("msg_1", usage(10)),
      assistant("msg_2", usage(20)),
    ]);
    const { points } = await readContextTimeline(p);
    assert.equal(points.length, 2);
    assert.deepEqual(
      points.map((pt) => pt.turn),
      [1, 2]
    );
  });

  it("context_tokens sums input, cache_read and cache_creation", async () => {
    const p = writeTranscript("/tmp/ctx-sum", "sum", [assistant("msg_1", usage(10, 1000, 200))]);
    const { points } = await readContextTimeline(p);
    assert.equal(points[0].context_tokens, 1210);
  });

  it("post_tokens is the first assistant context after the boundary", async () => {
    const p = writeTranscript("/tmp/ctx-post", "post", [
      user("a"),
      assistant("msg_1", usage(100, 90000)),
      boundary("b1", 90100),
      user("summary"),
      assistant("msg_2", usage(50, 8000)),
      assistant("msg_3", usage(50, 9000)),
    ]);
    const { compactions } = await readContextTimeline(p);
    assert.equal(compactions.length, 1);
    assert.equal(compactions[0].uuid, "b1");
    assert.equal(compactions[0].trigger, "manual");
    assert.equal(compactions[0].pre_tokens, 90100);
    assert.equal(compactions[0].post_tokens, 8050);
    assert.equal(compactions[0].duration_ms, 4000);
  });

  it("replaced_messages counts user+assistant lines since the previous boundary", async () => {
    const p = writeTranscript("/tmp/ctx-replaced", "replaced", [
      user("a"),
      assistant("msg_1", usage(1)),
      user("b"),
      boundary("b1", 10),
      user("summary"),
      assistant("msg_2", usage(1)),
      boundary("b2", 10),
    ]);
    const { compactions } = await readContextTimeline(p);
    assert.equal(compactions[0].replaced_messages, 3);
    assert.equal(compactions[1].replaced_messages, 2);
    assert.equal(compactions[1].post_tokens, null);
  });

  it("ignores synthetic assistant turns with no context", async () => {
    const p = writeTranscript("/tmp/ctx-synthetic", "synthetic", [
      assistant("msg_1", usage(100, 900)),
      boundary("b1", 1000),
      assistant("msg_2", usage(0)),
      assistant("msg_3", usage(50, 400)),
    ]);
    const { points, compactions } = await readContextTimeline(p);
    assert.equal(points.length, 2);
    assert.equal(compactions[0].post_tokens, 450);
  });

  it("skips malformed lines", async () => {
    const p = writeTranscript("/tmp/ctx-bad", "bad", [
      assistant("msg_1", usage(5)),
      "{not json",
      assistant("msg_2", usage(7)),
    ]);
    const { points } = await readContextTimeline(p);
    assert.equal(points.length, 2);
  });

  it("returns empty arrays when no compaction", async () => {
    const p = writeTranscript("/tmp/ctx-none", "none", [user("hi")]);
    const timeline = await readContextTimeline(p);
    assert.deepEqual(timeline, { points: [], compactions: [] });
  });
});

describe("GET /api/sessions/:id/context-timeline", () => {
  it("serves the timeline of a Claude session", async () => {
    const cwd = "/tmp/ctx-route";
    const sid = "c7c7c7c7-0000-1111-2222-333333333333";
    writeTranscript(cwd, sid, [assistant("msg_1", usage(42))]);
    await post("/api/sessions", { id: sid, cwd });
    const res = await get(`/api/sessions/${sid}/context-timeline`);
    assert.equal(res.status, 200);
    assert.equal(res.body.points[0].context_tokens, 42);
  });

  it("returns empty timeline for codex sessions", async () => {
    const sid = "codex-ctx-1";
    db.prepare(
      "INSERT INTO sessions (id, name, status, provider) VALUES (?, ?, 'completed', 'codex')"
    ).run(sid, "codex");
    const res = await get(`/api/sessions/${sid}/context-timeline`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { points: [], compactions: [] });
  });

  it("returns empty timeline when the transcript is gone", async () => {
    const sid = "c8c8c8c8-0000-1111-2222-333333333333";
    await post("/api/sessions", { id: sid, cwd: "/tmp/ctx-missing" });
    const res = await get(`/api/sessions/${sid}/context-timeline`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { points: [], compactions: [] });
  });

  it("404 for unknown session", async () => {
    const res = await get("/api/sessions/does-not-exist/context-timeline");
    assert.equal(res.status, 404);
  });
});
