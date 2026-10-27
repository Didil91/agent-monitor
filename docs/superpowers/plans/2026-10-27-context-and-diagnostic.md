# Contexte, compactions et diagnostic — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** rendre visibles les compactions et la fenêtre de contexte d'une session Claude Code, signaler les sessions atypiques, puis livrer un récapitulatif des fonctionnalités.

**Architecture :** deux modules serveur purs et testables (`server/lib/context-timeline.js`, `server/lib/session-diagnostic.js`), exposés par deux routes GET. Le client les consomme via `api`. Côté transcript, on ajoute un `session_event` (`event_kind: "compaction"`) et un drapeau sur le message de résumé.

**Tech Stack :** Node/Express, better-sqlite3 (`server/db.js`), `node --test` ; React 19, d3, Vitest ; MCP TypeScript ; CLI `bin/ccam.js`.

**Spec :** `docs/superpowers/specs/2026-10-27-context-and-diagnostic-design.md`

## Global Constraints

- Aucun changement de schéma SQLite, aucun nouveau message WebSocket.
- `/api/sessions/:id/transcript` reste rétrocompatible : seuls des champs et un `event_kind` s'ajoutent.
- Chaque nouveau fichier source commence par un en-tête `@file` ; jamais de ligne `@author`.
- Toute nouvelle clé i18n existe dans toutes les locales de `client/src/i18n/locales/*` ; audit : `bash .claude/skills/i18n-parity/scripts/i18n-audit.sh`.
- Garde-fous du diagnostic : coût 1 $, tokens 2 000 000, durée 30 min, compactions 2, appels d'outils 200 ; P90 seulement à partir de 10 sessions.
- Commits en français `[Scope] Sujet`, sur la branche `sdd/context-and-diagnostic`.

## Review Focus

- Session sans aucune compaction → la route renvoie `compactions: []` et la courbe s'affiche sans marqueur (test tâche 2).
- Transcript purgé de `~/.claude` → la route lit l'instantané durable, sinon renvoie `{ points: [], compactions: [] }` sans 500 (test tâche 2).
- Ligne JSONL corrompue au milieu du fichier → ignorée, le reste est lu (test tâche 2).
- Moins de 10 sessions sur la période → seuils = garde-fous, `limits` le dit (test tâche 5).
- Session avec tokens en baseline (après réécriture) → total = courant + baseline (test tâche 5).

---

## Lot 1 — Compactions côté serveur

### Tâche 1 : marqueur de compaction dans `/transcript`

**Files :**
- Modify : `server/routes/sessions.js` (`parseMessage` dans la route `/:id/transcript`, ~l.1500)
- Modify : `client/src/lib/types.ts:2622-2626` (types seulement)
- Test : `server/__tests__/transcript-compaction.test.js`

**Interfaces :**
- Produit : message `{ type: "session_event", event_kind: "compaction", trigger: "auto"|"manual"|null, pre_tokens: number|null, duration_ms: number|null, timestamp, content: [] }` ; le message `user` issu d'une ligne `isCompactSummary: true` reçoit `compact_summary: true` et `sender: "system"`.

- [ ] Test `compact_boundary yields a compaction session_event` : un JSONL fixture avec une ligne `{type:"system",subtype:"compact_boundary",compactMetadata:{trigger:"auto",preTokens:691105,durationMs:82343}}` → le message renvoyé a `event_kind === "compaction"`, `pre_tokens === 691105`, `trigger === "auto"`, `duration_ms === 82343`.
- [ ] Test `compact summary is flagged and not attributed to the user` : la ligne `isCompactSummary:true` suivante → `compact_summary === true`, `sender === "system"`.
- [ ] Lancer `node --test server/__tests__/transcript-compaction.test.js`, attendu : FAIL.
- [ ] Implémenter dans `parseMessage` : branche `entry.type === "system" && entry.subtype === "compact_boundary"` avant le filtre `local_command` ; marquage du résumé sur la branche `user`. Étendre `event_kind` à `"rename" | "compaction"` et ajouter les champs optionnels dans `types.ts`.
- [ ] Relancer, attendu : PASS ; puis `npm run test:server`.
- [ ] Commit `[API] Transcript : les compactions apparaissent comme un événement de session`.

### Tâche 2 : `GET /api/sessions/:id/context-timeline`

**Files :**
- Create : `server/lib/context-timeline.js`
- Modify : `server/routes/sessions.js` (nouvelle route, réutilise `resolveSessionTranscriptPath` et `sessionIsInScope`)
- Modify : `server/openapi-extra/` (déclaration de la route, selon le motif des fichiers voisins)
- Test : `server/__tests__/context-timeline.test.js`

**Interfaces :**
- Produit : `async readContextTimeline(jsonlPath: string) => { points: Array<{ turn: number, timestamp: string|null, context_tokens: number }>, compactions: Array<{ uuid: string|null, timestamp: string|null, trigger: string|null, pre_tokens: number|null, post_tokens: number|null, duration_ms: number|null, replaced_messages: number }> }`.
- Route : 404 si session absente ou hors scope ; `{ points: [], compactions: [] }` si fournisseur ≠ claude ou fichier introuvable.

- [ ] Tests sur fixtures JSONL :
  - `counts each assistant message.id once` : deux lignes assistant même `message.id` → un seul point.
  - `context_tokens sums input, cache_read and cache_creation` : usage `{input_tokens:10,cache_read_input_tokens:1000,cache_creation_input_tokens:200}` → `1210`.
  - `post_tokens is the first assistant context after the boundary` et `replaced_messages counts user+assistant lines since the previous boundary`.
  - `skips malformed lines`, `returns empty arrays when no compaction`.
  - Route : `returns empty timeline for codex sessions`, `404 for unknown session`.
- [ ] Lancer, attendu : FAIL.
- [ ] Implémenter `readContextTimeline` en lecture `readline` streamée (même style que `/transcript`), puis la route.
- [ ] Relancer, attendu : PASS ; `npm run test:server`.
- [ ] Commit `[API] Route context-timeline : taille du contexte par tour et détail des compactions`.

## Lot 2 — Compactions côté client

### Tâche 3 : bloc « Contexte compacté » dans la conversation

**Files :**
- Modify : `client/src/components/conversation/MessageList.tsx:379` (branche `session_event`)
- Modify : locales `client/src/i18n/locales/*/` (clés `conversation.compaction.*`)
- Test : `client/src/components/conversation/__tests__/MessageList.compaction.test.tsx`

- [ ] Tests : `renders compaction marker with trigger and pre-tokens` (affiche « 691 105 » formaté via `fmt`, et le déclencheur traduit) ; `compact summary is collapsed and not shown as a user bubble` (le texte du résumé est absent tant qu'on n'a pas cliqué, présent après clic).
- [ ] FAIL, implémenter, PASS ; `npm run test:client`.
- [ ] Commit `[Client] Conversation : marqueur de compaction et résumé repliable`.

### Tâche 4 : courbe de la fenêtre de contexte

**Files :**
- Create : `client/src/components/ContextTimelineChart.tsx` (d3, comme les graphiques d'Analytics)
- Create : `client/src/hooks/useContextTimeline.ts` (appel `api`, aucun appel dans le composant)
- Modify : `client/src/lib/api.ts`, `client/src/lib/types.ts`, `client/src/components/SessionOverview.tsx` (insertion sous les tuiles, Claude uniquement)
- Modify : locales (clés `sessionOverview.context.*`)
- Test : `client/src/components/__tests__/ContextTimelineChart.test.tsx`

- [ ] Tests : `draws one marker per compaction`, `lists compactions with before, after and saved tokens`, `renders nothing for an empty timeline`.
- [ ] FAIL, implémenter, PASS ; `npm run test:client` ; mise à jour des snapshots d'écran après relecture du diff (`cd client && npx vitest run -u`) ; `npm run verify`.
- [ ] Commit `[Client] Vue d'ensemble : courbe du contexte et liste des compactions`.

## Lot 3 — Diagnostic côté serveur

### Tâche 5 : module et route du diagnostic

**Files :**
- Create : `server/lib/session-diagnostic.js`
- Modify : `server/routes/analytics.js` (route `GET /diagnostic`), `server/openapi-extra/`
- Test : `server/__tests__/session-diagnostic.test.js`

**Interfaces :**
- Produit : `percentile(values: number[], p: number) => number` (interpolation linéaire) ; `buildDiagnostic(sessionMetrics: SessionMetrics[], { minSample = 10 }) => { thresholds, sessions, limits }` (pur) ; `collectSessionMetrics(db, { days, sources, providers }) => SessionMetrics[]` où `SessionMetrics = { id, name, started_at, provider, cost, tokens, duration_min, compactions, tool_calls }`.
- Indicateurs : `tokens` = somme courant + `baseline_*` de `token_usage` ; `cost` via `calculateProviderCost` daté du jour de début ; `compactions` = agents `subagent_type = 'compaction'` ; `tool_calls` = événements `PreToolUse` ; sessions `status != 'active'` uniquement.
- Flag : `{ metric, value, threshold, ratio, kind: "measured"|"estimated" }`, `kind = "estimated"` pour `cost` seulement.

- [ ] Tests : `percentile of 1..10 at 0.9 is 9.1` ; `threshold is the guardrail when P90 is lower` ; `uses guardrails only below 10 sessions and says so in limits` ; `sessions sorted by highest ratio` ; `tokens include baselines` ; `excludes active sessions` ; `limits always mention unmeasured tool errors`.
- [ ] FAIL, implémenter, PASS ; `npm run test:server`.
- [ ] Commit `[API] Diagnostic : sessions atypiques par rapport au P90 de l'historique`.

### Tâche 6 : outil MCP et commande `ccam diagnostic`

**Files :**
- Modify : `mcp/src/tools/domains/observability-tools.ts` (outil `dashboard_get_session_diagnostic`, entrée `{ days?: number }`)
- Modify : `bin/ccam.js` (`cmdDiagnostic(flags)`, `--days`, ajout à l'aide et au `switch`)
- Test : `server/__tests__/ccam-cli.test.js` (cas `diagnostic` selon le motif existant)

- [ ] Test CLI d'abord, FAIL, implémenter, PASS ; `npm run mcp:typecheck`, `npm run mcp:build`, `npm run test:server`.
- [ ] Commit `[MCP] Diagnostic des sessions exposé en outil MCP et en commande ccam`.

## Lot 4 — Diagnostic côté client

### Tâche 7 : section Analytics et encadré de session

**Files :**
- Create : `client/src/hooks/useSessionDiagnostic.ts`, `client/src/components/DiagnosticTable.tsx`
- Modify : `client/src/pages/Analytics.tsx`, `client/src/components/SessionOverview.tsx`, `client/src/lib/api.ts`, `client/src/lib/types.ts`, locales (`analytics.diagnostic.*`)
- Test : `client/src/components/__tests__/DiagnosticTable.test.tsx`

- [ ] Tests : `lists flagged sessions with one chip per exceeded metric` ; `marks cost as estimated` ; `shows the limits list` ; `empty state when nothing is flagged`.
- [ ] FAIL, implémenter, PASS ; snapshots relus ; `npm run verify`.
- [ ] Commit `[Client] Analytics : section des sessions atypiques`.

## Lot 5 — Documentation

### Tâche 8 : docs du projet et récapitulatif

**Files :**
- Create : `docs/FEATURES.md` (français, organisé par besoin, renvoie vers écran / `ccam` / outil MCP)
- Modify : `docs/README.md`, `docs/API.md`, `docs/CLI.md`, `docs/MCP.md`, `README.md` + miroirs CN/VN/KO/ES, wiki si concerné (skills `update-project-docs` et `i18n-parity`)

- [ ] Rédiger, puis `bash .claude/skills/i18n-parity/scripts/i18n-audit.sh` et `npm run verify` : tout vert.
- [ ] Commit `[Doc] Récapitulatif des fonctionnalités, contexte et diagnostic documentés`.
