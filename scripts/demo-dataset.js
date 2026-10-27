/**
 * @file Fictional, presentation-ready dataset for demos, screenshots and videos
 * (`npm run seed:demo`). Seeds six made-up projects and their branches across
 * Claude Code, Codex and Cursor: live, waiting, errored and finished sessions
 * with subagent trees, tool events and token usage, two outliers the session
 * diagnostic flags, and Claude transcripts with compactions written ONLY to
 * the dashboard's own snapshot directory (never to ~/.claude). Every row id
 * starts with DEMO_PREFIX; re-running inserts nothing new.
 */

const fs = require("fs");
const path = require("path");

const DEMO_PREFIX = "demo-set-";

const PROJECTS = [
  { slug: "api-paiement", cwd: "/home/dev/work/api-paiement" },
  { slug: "app-mobile", cwd: "/home/dev/work/app-mobile" },
  { slug: "refonte-auth", cwd: "/home/dev/work/refonte-auth" },
  { slug: "data-pipeline", cwd: "/home/dev/work/data-pipeline" },
  { slug: "site-vitrine", cwd: "/home/dev/work/site-vitrine" },
  { slug: "infra-k8s", cwd: "/home/dev/work/infra-k8s" },
];

const MODELS = {
  claude: ["claude-opus-5-5", "claude-sonnet-5"],
  codex: ["gpt-5.5"],
  cursor: ["composer-2.5"],
};

const TOOLS = ["Read", "Edit", "Bash", "Grep", "Glob", "Write", "Agent", "WebFetch"];

const SUBAGENTS = [
  { type: "Explore", name: "Code Explorer", task: "Cartographie des modules concernés" },
  { type: "code-reviewer", name: "Code Reviewer", task: "Relecture du diff avant merge" },
  { type: "general-purpose", name: "Test Runner", task: "Lance la suite de tests ciblée" },
  { type: "Plan", name: "Planner", task: "Découpe le chantier en étapes" },
  { type: "debugger", name: "Debugger", task: "Isole le test instable" },
];

/**
 * Live sessions shown on the dashboard and Kanban. `transcript` marks the ones
 * whose context curve is written (first one = the showcase curve).
 */
const LIVE = [
  {
    key: "stripe",
    project: "api-paiement",
    branch: "feat/stripe-webhooks",
    provider: "claude",
    status: "working",
    tool: "Edit",
    task: "Rejoue les webhooks Stripe en échec avec backoff",
    subagents: 3,
    transcript: { turns: 140, compactions: 3 },
  },
  {
    key: "passkeys",
    project: "refonte-auth",
    branch: "feat/passkeys",
    provider: "claude",
    status: "waiting",
    awaiting: "notification",
    task: "Attend l'autorisation : Bash(npm run migrate:prod)",
    subagents: 2,
    transcript: { turns: 70, compactions: 1 },
  },
  {
    key: "offline",
    project: "app-mobile",
    branch: "feat/offline-sync",
    provider: "codex",
    status: "working",
    tool: "Bash",
    task: "Synchronisation hors ligne : file d'attente des mutations",
  },
  {
    key: "dbt",
    project: "data-pipeline",
    branch: "feat/dbt-models",
    provider: "cursor",
    status: "working",
    tool: "Write",
    task: "Modèles dbt pour le reporting mensuel",
  },
  {
    key: "pricing",
    project: "site-vitrine",
    branch: "feat/pricing-page",
    provider: "claude",
    status: "waiting",
    awaiting: "question",
    task: "Demande : garder l'ancien tarif annuel ?",
    subagents: 1,
  },
  {
    key: "helm",
    project: "infra-k8s",
    branch: "chore/helm-upgrade",
    provider: "codex",
    status: "error",
    task: "Montée de version Helm : quota API dépassé",
  },
  {
    key: "refund",
    project: "api-paiement",
    branch: "fix/refund-rounding",
    provider: "claude",
    status: "working",
    tool: "Grep",
    task: "Arrondi des remboursements partiels",
    subagents: 1,
  },
];

/** Finished sessions of the last weeks; the two last ones are the outliers. */
const HISTORY_BRANCHES = [
  ["api-paiement", "feat/invoices-pdf"],
  ["app-mobile", "fix/push-badges"],
  ["refonte-auth", "chore/session-tokens"],
  ["data-pipeline", "fix/late-events"],
  ["site-vitrine", "feat/blog-seo"],
  ["infra-k8s", "feat/preview-envs"],
  ["api-paiement", "feat/sepa-mandates"],
  ["app-mobile", "feat/dark-mode"],
  ["refonte-auth", "fix/mfa-recovery"],
  ["data-pipeline", "feat/cdc-postgres"],
  ["site-vitrine", "fix/lighthouse"],
  ["infra-k8s", "fix/hpa-thresholds"],
  ["api-paiement", "chore/deps-upgrade"],
  ["app-mobile", "feat/deep-links"],
  ["refonte-auth", "feat/sso-saml"],
  ["data-pipeline", "chore/airflow-upgrade"],
  ["site-vitrine", "feat/i18n-de"],
  ["infra-k8s", "chore/cert-rotation"],
  ["api-paiement", "fix/idempotency-keys"],
  ["app-mobile", "fix/crash-android-14"],
  ["refonte-auth", "chore/audit-logs"],
  ["data-pipeline", "feat/anomaly-alerts"],
  ["site-vitrine", "feat/case-studies"],
  ["infra-k8s", "feat/cost-dashboards"],
  ["api-paiement", "feat/payouts-v2"],
  ["app-mobile", "chore/rn-upgrade"],
  ["refonte-auth", "fix/session-fixation"],
  ["data-pipeline", "fix/timezone-buckets"],
];

const OUTLIERS = [
  {
    key: "migration",
    project: "data-pipeline",
    branch: "feat/warehouse-migration",
    task: "Migration complète de l'entrepôt de données",
    minutes: 13 * 60,
    toolCalls: 920,
    tokensScale: 14,
    compactions: 5,
  },
  {
    key: "monorepo",
    project: "app-mobile",
    branch: "chore/monorepo-split",
    task: "Découpage du monorepo en paquets",
    minutes: 190,
    toolCalls: 610,
    tokensScale: 9,
    compactions: 3,
  },
];

/** Small deterministic PRNG so the demo looks the same on every machine. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedDemoDataset({ db, snapshotDir, now = Date.now() }) {
  const random = createRandom(20261027);
  const iso = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();
  const result = { inserted: 0, transcripts: [] };
  const statements = prepareStatements(db);

  const insertAll = db.transaction(() => {
    LIVE.forEach((live, index) => {
      const sessionId = `${DEMO_PREFIX}live-${live.key}`;
      if (statements.sessionExists.get(sessionId)) return;
      seedLiveSession(statements, { live, sessionId, index, iso, random });
      result.inserted++;
    });
    HISTORY_BRANCHES.forEach(([project, branch], index) => {
      const sessionId = `${DEMO_PREFIX}done-${String(index + 1).padStart(2, "0")}`;
      if (statements.sessionExists.get(sessionId)) return;
      seedFinishedSession(statements, {
        sessionId,
        project,
        branch,
        provider: index % 5 === 3 ? "codex" : "claude",
        task: `Livraison de ${branch}`,
        startedMinutesAgo: 60 * 24 * (1 + ((index * 2) % 26)) + index * 37,
        minutes: 25 + Math.floor(random() * 60),
        toolCalls: 40 + Math.floor(random() * 90),
        tokensScale: 1 + random(),
        compactions: index % 4 === 0 ? 1 : 0,
        iso,
        random,
      });
      result.inserted++;
    });
    OUTLIERS.forEach((outlier, index) => {
      const sessionId = `${DEMO_PREFIX}outlier-${outlier.key}`;
      if (statements.sessionExists.get(sessionId)) return;
      seedFinishedSession(statements, {
        ...outlier,
        sessionId,
        provider: "claude",
        startedMinutesAgo: 60 * 24 * (3 + index * 5),
        iso,
        random,
      });
      result.inserted++;
    });
  });
  insertAll();

  fs.mkdirSync(snapshotDir, { recursive: true });
  LIVE.filter((live) => live.transcript).forEach((live) => {
    const file = path.join(snapshotDir, `${DEMO_PREFIX}live-${live.key}.jsonl`);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, buildTranscript({ live, iso, random }));
    }
    result.transcripts.push(file);
  });
  return result;
}

function prepareStatements(db) {
  return {
    sessionExists: db.prepare("SELECT 1 FROM sessions WHERE id = ?"),
    insertSession: db.prepare(
      `INSERT INTO sessions (id, name, status, cwd, model, provider, source, started_at, ended_at,
         updated_at, metadata, awaiting_input_since, awaiting_reason, card_prompt_preview)
       VALUES (?, ?, ?, ?, ?, ?, 'local', ?, ?, ?, ?, ?, ?, ?)`
    ),
    insertAgent: db.prepare(
      `INSERT INTO agents (id, session_id, name, type, subagent_type, status, task, current_tool,
         started_at, ended_at, updated_at, parent_agent_id, awaiting_input_since, awaiting_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    insertEvent: db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, data, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`
    ),
    insertTokens: db.prepare(
      `INSERT INTO token_usage (session_id, model, input_tokens, output_tokens, cache_read_tokens,
         cache_write_tokens) VALUES (?, ?, ?, ?, ?, ?)`
    ),
  };
}

function projectCwd(slug) {
  return PROJECTS.find((project) => project.slug === slug).cwd;
}

function seedLiveSession(statements, { live, sessionId, index, iso, random }) {
  const model = MODELS[live.provider][index % MODELS[live.provider].length];
  const startedMinutesAgo = 20 + index * 11;
  const awaitingSince = live.status === "waiting" ? iso(3 + index) : null;
  const sessionStatus = live.status === "error" ? "error" : "active";
  statements.insertSession.run(
    sessionId,
    `${live.project} · ${live.branch}`,
    sessionStatus,
    projectCwd(live.project),
    model,
    live.provider,
    iso(startedMinutesAgo),
    null,
    iso(1),
    JSON.stringify({ git_branch: live.branch, demo: true }),
    awaitingSince,
    live.awaiting ?? null,
    live.task
  );
  const mainId = `${sessionId}-main`;
  const mainStatus = live.status === "error" ? "error" : live.status;
  statements.insertAgent.run(
    mainId,
    sessionId,
    "Main Agent",
    "main",
    null,
    mainStatus,
    live.task,
    live.status === "working" ? live.tool : null,
    iso(startedMinutesAgo),
    null,
    iso(1),
    null,
    awaitingSince,
    live.awaiting ?? null
  );
  for (let i = 0; i < (live.subagents ?? 0); i++) {
    const subagent = SUBAGENTS[(index + i) % SUBAGENTS.length];
    const finished = i < (live.subagents ?? 0) - 1;
    statements.insertAgent.run(
      `${sessionId}-sub-${i + 1}`,
      sessionId,
      subagent.name,
      "subagent",
      subagent.type,
      finished ? "completed" : "working",
      subagent.task,
      finished ? null : TOOLS[(index + i) % TOOLS.length],
      iso(startedMinutesAgo - 5 - i * 3),
      finished ? iso(startedMinutesAgo - 9 - i * 3) : null,
      iso(1),
      mainId,
      null,
      null
    );
  }
  seedActivity(statements, {
    sessionId,
    agentId: mainId,
    startedMinutesAgo,
    endedMinutesAgo: 1,
    toolCalls: 30 + Math.floor(random() * 50),
    iso,
    random,
  });
  seedTokens(statements, { sessionId, model, scale: 0.6 + random() });
}

function seedFinishedSession(
  statements,
  {
    sessionId,
    project,
    branch,
    provider,
    task,
    startedMinutesAgo,
    minutes,
    toolCalls,
    tokensScale,
    compactions,
    iso,
    random,
  }
) {
  const model = MODELS[provider][0];
  const endedMinutesAgo = startedMinutesAgo - minutes;
  statements.insertSession.run(
    sessionId,
    `${project} · ${branch}`,
    "completed",
    projectCwd(project),
    model,
    provider,
    iso(startedMinutesAgo),
    iso(endedMinutesAgo),
    iso(endedMinutesAgo),
    JSON.stringify({ git_branch: branch, demo: true }),
    null,
    null,
    task
  );
  const mainId = `${sessionId}-main`;
  statements.insertAgent.run(
    mainId,
    sessionId,
    "Main Agent",
    "main",
    null,
    "completed",
    task,
    null,
    iso(startedMinutesAgo),
    iso(endedMinutesAgo),
    iso(endedMinutesAgo),
    null,
    null,
    null
  );
  for (let i = 0; i < compactions; i++) {
    const at = iso(startedMinutesAgo - Math.round(((i + 1) * minutes) / (compactions + 1)));
    statements.insertAgent.run(
      `${sessionId}-compact-${i + 1}`,
      sessionId,
      "Context Compaction",
      "subagent",
      "compaction",
      "completed",
      "Automatic conversation context compression",
      null,
      at,
      at,
      at,
      mainId,
      null,
      null
    );
  }
  seedActivity(statements, {
    sessionId,
    agentId: mainId,
    startedMinutesAgo,
    endedMinutesAgo,
    toolCalls,
    iso,
    random,
  });
  seedTokens(statements, { sessionId, model, scale: tokensScale });
}

function seedActivity(
  statements,
  { sessionId, agentId, startedMinutesAgo, endedMinutesAgo, toolCalls, iso, random }
) {
  const span = Math.max(1, startedMinutesAgo - endedMinutesAgo);
  statements.insertEvent.run(
    sessionId,
    agentId,
    "SessionStart",
    null,
    "Session démarrée",
    iso(startedMinutesAgo)
  );
  for (let i = 0; i < toolCalls; i++) {
    const tool = TOOLS[Math.floor(random() * TOOLS.length)];
    const at = iso(startedMinutesAgo - (span * (i + 1)) / (toolCalls + 1));
    statements.insertEvent.run(sessionId, agentId, "PreToolUse", tool, `Using tool: ${tool}`, at);
    statements.insertEvent.run(
      sessionId,
      agentId,
      "PostToolUse",
      tool,
      `Tool completed: ${tool}`,
      at
    );
  }
}

function seedTokens(statements, { sessionId, model, scale }) {
  statements.insertTokens.run(
    sessionId,
    model,
    Math.round(42_000 * scale),
    Math.round(68_000 * scale),
    Math.round(3_600_000 * scale),
    Math.round(310_000 * scale)
  );
}

/**
 * A Claude transcript whose context grows turn after turn and drops at each
 * compaction: the sawtooth the session overview draws.
 */
function buildTranscript({ live, iso, random }) {
  const { turns, compactions } = live.transcript;
  const compactAt = new Set(
    Array.from({ length: compactions }, (_, i) => Math.round(((i + 1) * turns) / (compactions + 1)))
  );
  const lines = [];
  let context = 24_000;
  for (let turn = 1; turn <= turns; turn++) {
    const at = iso(turns - turn + 2);
    if (compactAt.has(turn)) {
      const preTokens = context;
      lines.push({
        type: "system",
        subtype: "compact_boundary",
        uuid: `${DEMO_PREFIX}boundary-${live.key}-${turn}`,
        timestamp: at,
        content: "Conversation compacted",
        compactMetadata: { trigger: "auto", preTokens, durationMs: 40_000 + turn * 300 },
      });
      lines.push({
        type: "user",
        isCompactSummary: true,
        timestamp: at,
        message: {
          role: "user",
          content: `Résumé de la conversation précédente : ${live.task}. Fichiers clés, décisions prises et prochaines étapes.`,
        },
      });
      context = 30_000 + Math.round(random() * 20_000);
    }
    lines.push({
      type: "user",
      timestamp: at,
      message: { role: "user", content: `Étape ${turn} : ${live.task}` },
    });
    lines.push({
      type: "assistant",
      timestamp: at,
      message: {
        id: `${DEMO_PREFIX}msg-${live.key}-${turn}`,
        role: "assistant",
        model: MODELS.claude[0],
        content: [{ type: "text", text: `Étape ${turn} traitée.` }],
        usage: {
          input_tokens: 400 + Math.round(random() * 600),
          cache_read_input_tokens: context,
          cache_creation_input_tokens: 1_500 + Math.round(random() * 2_500),
          output_tokens: 600 + Math.round(random() * 900),
        },
      },
    });
    context += 3_500 + Math.round(random() * 6_000);
  }
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

/** Remove every demo row and transcript (keeps all other data). */
function removeDemoDataset({ db, snapshotDir }) {
  const like = `${DEMO_PREFIX}%`;
  db.transaction(() => {
    db.prepare("DELETE FROM events WHERE session_id LIKE ?").run(like);
    db.prepare("DELETE FROM token_usage WHERE session_id LIKE ?").run(like);
    db.prepare("DELETE FROM agents WHERE session_id LIKE ?").run(like);
    db.prepare("DELETE FROM sessions WHERE id LIKE ?").run(like);
  })();
  if (!fs.existsSync(snapshotDir)) return;
  for (const file of fs.readdirSync(snapshotDir)) {
    if (file.startsWith(DEMO_PREFIX)) fs.rmSync(path.join(snapshotDir, file));
  }
}

module.exports = { DEMO_PREFIX, seedDemoDataset, removeDemoDataset };
