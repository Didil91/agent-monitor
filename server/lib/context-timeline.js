/**
 * @file Builds a Claude Code session's context-window timeline from its JSONL
 * transcript: the context size at each assistant turn (input + cache read +
 * cache creation, one point per message.id) and a detail row per compaction
 * boundary (trigger, size before and after, duration, messages replaced).
 * Served by GET /api/sessions/:id/context-timeline.
 */

const fs = require("fs");
const readline = require("readline");

function contextTokensOf(usage) {
  return (
    (usage.input_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0)
  );
}

function parseLine(line) {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * Stream a JSONL transcript once and return
 * `{ points: [{ turn, timestamp, context_tokens }], compactions: [{ uuid,
 * timestamp, trigger, pre_tokens, post_tokens, duration_ms, replaced_messages,
 * after_turn }] }`. Malformed lines are skipped.
 */
async function readContextTimeline(jsonlPath) {
  const points = [];
  const compactions = [];
  const seenMessageIds = new Set();
  let messagesSinceBoundary = 0;
  let awaitingPostTokens = null;

  const rl = readline.createInterface({
    input: fs.createReadStream(jsonlPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const entry = parseLine(line);
    if (!entry) continue;

    if (entry.type === "system" && entry.subtype === "compact_boundary") {
      const meta = entry.compactMetadata || {};
      awaitingPostTokens = {
        uuid: entry.uuid || null,
        timestamp: entry.timestamp || null,
        trigger: typeof meta.trigger === "string" ? meta.trigger : null,
        pre_tokens: Number.isFinite(meta.preTokens) ? meta.preTokens : null,
        post_tokens: null,
        duration_ms: Number.isFinite(meta.durationMs) ? meta.durationMs : null,
        replaced_messages: messagesSinceBoundary,
        after_turn: points.length,
      };
      compactions.push(awaitingPostTokens);
      messagesSinceBoundary = 0;
      continue;
    }

    if (entry.type !== "user" && entry.type !== "assistant") continue;
    if (entry.isCompactSummary === true) continue;

    // Claude Code writes one line per content block of the same API message:
    // count a message.id once, for both the replaced count and the curve.
    const message = entry.message;
    const messageId = entry.type === "assistant" && message ? message.id : null;
    if (messageId) {
      if (seenMessageIds.has(messageId)) continue;
      seenMessageIds.add(messageId);
    }
    messagesSinceBoundary++;

    if (entry.type !== "assistant" || !message || !message.usage) continue;

    const contextTokens = contextTokensOf(message.usage);
    points.push({
      turn: points.length + 1,
      timestamp: entry.timestamp || null,
      context_tokens: contextTokens,
    });
    if (awaitingPostTokens) {
      awaitingPostTokens.post_tokens = contextTokens;
      awaitingPostTokens = null;
    }
  }

  return { points, compactions };
}

module.exports = { readContextTimeline };
