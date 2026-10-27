/**
 * @file Session diagnostic: finds finished sessions that cost, consumed,
 * lasted, compacted or called tools far more than the user's own habits.
 * Each metric's threshold is max(P90 of the period's sessions, a fixed
 * guardrail) so a uniformly light history does not flag trivial outliers.
 * Served by GET /api/analytics/diagnostic; computed on demand, no schema.
 */

const { calculateProviderCost } = require("../routes/pricing");

const MIN_SAMPLE_FOR_P90 = 10;

/** Floors under which a session is never called atypical, whatever the P90. */
const GUARDRAILS = Object.freeze({
  cost: 1,
  tokens: 2_000_000,
  duration_min: 30,
  compactions: 2,
  tool_calls: 200,
});

const METRICS = Object.keys(GUARDRAILS);

/** Cost depends on the editable price table; every other metric is counted. */
const ESTIMATED_METRICS = new Set(["cost"]);

/** Linear-interpolated percentile (p in [0, 1]) of a non-empty number list. */
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const interpolated = sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  return Math.round(interpolated * 1e6) / 1e6;
}

function buildDiagnostic(sessionMetrics, { minSample = MIN_SAMPLE_FOR_P90 } = {}) {
  const thresholds = computeThresholds(sessionMetrics, minSample);
  const sessions = sessionMetrics
    .map((session) => ({ session, flags: flagsFor(session, thresholds) }))
    .filter(({ flags }) => flags.length > 0)
    .sort((a, b) => maxRatio(b.flags) - maxRatio(a.flags))
    .map(({ session, flags }) => ({
      id: session.id,
      name: session.name,
      started_at: session.started_at,
      provider: session.provider,
      flags,
    }));
  return { thresholds, sessions, limits: limitsFor(sessionMetrics, minSample) };
}

function computeThresholds(sessionMetrics, minSample) {
  const thresholds = {};
  for (const metric of METRICS) {
    const values = sessionMetrics.map((s) => s[metric]).filter((v) => Number.isFinite(v));
    const p90 = values.length >= minSample ? percentile(values, 0.9) : null;
    thresholds[metric] = {
      p90,
      guardrail: GUARDRAILS[metric],
      threshold: Math.max(p90 ?? 0, GUARDRAILS[metric]),
    };
  }
  return thresholds;
}

function flagsFor(session, thresholds) {
  const flags = [];
  for (const metric of METRICS) {
    const value = session[metric];
    const { threshold } = thresholds[metric];
    if (!Number.isFinite(value) || value <= threshold) continue;
    flags.push({
      metric,
      value,
      threshold,
      ratio: Math.round((value / threshold) * 100) / 100,
      kind: ESTIMATED_METRICS.has(metric) ? "estimated" : "measured",
    });
  }
  return flags;
}

function maxRatio(flags) {
  return flags.reduce((max, flag) => Math.max(max, flag.ratio), 0);
}

/** Machine-readable codes the UI translates: what the diagnostic cannot see. */
function limitsFor(sessionMetrics, minSample) {
  const limits = ["tool_errors_not_captured", "active_sessions_excluded", "cost_estimated"];
  if (sessionMetrics.length < minSample) limits.push("small_sample");
  if (sessionMetrics.some((s) => s.provider === "cursor")) limits.push("cursor_cost_unreliable");
  return limits;
}

/**
 * One metrics row per finished, non-empty session started in the last `days`
 * days, optionally restricted to source machines and providers.
 */
function collectSessionMetrics(db, { days, sources = null, providers = null }) {
  const sessions = selectFinishedSessions(db, { days, sources, providers });
  if (sessions.length === 0) return [];
  const compactionsBySession = countBySession(
    db,
    "SELECT session_id, COUNT(*) AS n FROM agents WHERE subagent_type = 'compaction' GROUP BY session_id"
  );
  const toolCallsBySession = countBySession(
    db,
    "SELECT session_id, COUNT(*) AS n FROM events WHERE event_type = 'PreToolUse' GROUP BY session_id"
  );
  const pricing = {
    claude: db.prepare("SELECT * FROM model_pricing").all(),
    gpt: db.prepare("SELECT * FROM gpt_model_pricing").all(),
    cursor: db.prepare("SELECT * FROM cursor_model_pricing").all(),
  };
  const tokensStatement = db.prepare(TOKENS_BY_SESSION_SQL);

  return sessions
    .map((session) => {
      const provider = session.provider || "claude";
      const tokenRows = tokensStatement.all(session.id).map((row) => ({ ...row, provider }));
      const tokens = tokenRows.reduce(
        (sum, row) =>
          sum +
          row.input_tokens +
          row.output_tokens +
          row.cache_read_tokens +
          row.cache_write_tokens,
        0
      );
      const cost = calculateProviderCost(
        tokenRows,
        pricing.claude,
        pricing.gpt,
        pricing.cursor,
        session.start_date
      ).total_cost;
      return {
        id: session.id,
        name: session.name,
        started_at: session.started_at,
        provider,
        cost,
        tokens,
        duration_min: durationMinutes(session.started_at, session.ended_at),
        compactions: compactionsBySession.get(session.id) ?? 0,
        tool_calls: toolCallsBySession.get(session.id) ?? 0,
      };
    })
    .filter((row) => row.tokens > 0 || row.tool_calls > 0);
}

const TOKENS_BY_SESSION_SQL = `
  SELECT model, speed, inference_geo, service_tier, context_size,
    input_tokens + baseline_input AS input_tokens,
    output_tokens + baseline_output AS output_tokens,
    cache_read_tokens + baseline_cache_read AS cache_read_tokens,
    cache_write_tokens + baseline_cache_write AS cache_write_tokens,
    cache_write_1h_tokens + baseline_cache_write_1h AS cache_write_1h_tokens,
    web_search_requests + baseline_web_search AS web_search_requests,
    web_fetch_requests + baseline_web_fetch AS web_fetch_requests,
    code_execution_requests + baseline_code_execution AS code_execution_requests
  FROM token_usage WHERE session_id = ?`;

function selectFinishedSessions(db, { days, sources, providers }) {
  const clauses = ["status != 'active'", "started_at >= ?"];
  const params = [new Date(Date.now() - days * 86_400_000).toISOString()];
  if (sources?.length) {
    clauses.push(`COALESCE(source, 'local') IN (${sources.map(() => "?").join(",")})`);
    params.push(...sources);
  }
  if (providers?.length) {
    clauses.push(`COALESCE(provider, 'claude') IN (${providers.map(() => "?").join(",")})`);
    params.push(...providers);
  }
  return db
    .prepare(
      `SELECT id, name, provider, started_at, ended_at, DATE(started_at) AS start_date
       FROM sessions WHERE ${clauses.join(" AND ")}`
    )
    .all(...params);
}

function countBySession(db, sql) {
  return new Map(
    db
      .prepare(sql)
      .all()
      .map((row) => [row.session_id, row.n])
  );
}

function durationMinutes(startedAt, endedAt) {
  if (!startedAt || !endedAt) return null;
  const minutes = (Date.parse(endedAt) - Date.parse(startedAt)) / 60_000;
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes * 10) / 10 : null;
}

module.exports = { GUARDRAILS, percentile, buildDiagnostic, collectSessionMetrics };
