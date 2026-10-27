# Fenêtre de contexte, compactions et diagnostic des sessions

Date : 2026-10-27 — inspiré de deux fonctions d'AURA (github.com/Shaenn/aura).

## Pourquoi

1. **Compactions invisibles.** Quand Claude Code compacte une session, il écrit dans le JSONL une ligne `system` / `compact_boundary` (avec `compactMetadata.trigger`, `preTokens`, `durationMs`), suivie d'un message `user` `isCompactSummary: true` contenant le résumé qui remplace l'historique. Notre lecteur de transcript ignore la première et affiche la seconde comme un message humain ordinaire. On ne voit donc ni quand le contexte a sauté, ni de combien, ni par quoi il a été remplacé.
2. **Pas de repère « cette session est anormale ».** On a les coûts et les compteurs, mais rien ne dit qu'une session a coûté, duré ou compacté nettement plus que d'habitude.

## Objectifs

### A. Contexte et compactions (page détail de session, Claude Code uniquement)

- **Marqueur de compaction dans la conversation** : à la position de la `compact_boundary`, un bloc « Contexte compacté » qui affiche le déclencheur (auto/manuel), les tokens avant (`preTokens`) et la durée, toutes données de la ligne elle-même (le transcript est paginé, on n'y fait pas de calcul transversal). Le résumé (`isCompactSummary`) devient un bloc repliable « Résumé de compaction », replié par défaut, et n'est plus présenté comme un message de l'utilisateur.
- **Courbe de la fenêtre de contexte** dans l'onglet Vue d'ensemble : taille du contexte à chaque tour assistant (`input + cache_read + cache_creation` de `message.usage`), avec une ligne verticale à chaque compaction. Survol : numéro du tour, heure, tokens. Sous la courbe, une liste des compactions : avant → après, gain, déclencheur, nombre de messages remplacés.
- Une nouvelle route serveur `GET /api/sessions/:id/context-timeline` lit le JSONL principal de la session (fichier vivant, sinon l'instantané durable déjà utilisé par `/transcript`) et renvoie `{ points: [{ turn, timestamp, context_tokens }], compactions: [{ uuid, timestamp, trigger, pre_tokens, post_tokens, duration_ms, replaced_messages }] }`. Les tours assistants qui partagent un même `message.id` comptent une seule fois.

### B. Diagnostic des sessions

- Calcul à la demande, sans changement de schéma : pour chaque session Claude Code ou Codex terminée et non vide, les indicateurs **coût**, **tokens totaux**, **durée**, **nombre de compactions** et **nombre d'appels d'outils** (événements `PreToolUse`). Les erreurs d'outils ne sont pas captées par nos hooks : elles figurent dans `limits`, pas dans les indicateurs.
- **Seuil par indicateur** = max(P90 des sessions de l'utilisateur sur la période, garde-fou fixe). Garde-fous : coût 1 $, tokens 2 M, durée 30 min, compactions 2, appels d'outils 200. Le garde-fou évite de signaler une session à peine au-dessus d'un historique où tout est petit. Moins de 10 sessions dans la période : pas de P90, seul le garde-fou s'applique, et la réponse le signale.
- Une session est **atypique** si au moins un indicateur dépasse son seuil. Chaque dépassement donne la valeur, le seuil, le ratio valeur/seuil et la nature du chiffre : **mesuré** (compteurs, durée, tokens) ou **estimé** (coût, qui dépend de la table de prix).
- Route `GET /api/analytics/diagnostic?days=30` (filtres source/fournisseur existants respectés) : `{ period_days, sample_size, thresholds: {...}, sessions: [{ id, name, started_at, flags: [...] }], limits: [...] }`, sessions triées par plus grand ratio. `limits` liste en clair ce que le diagnostic ne sait pas mesurer : sessions en cours exclues, coût Cursor non fiable, transcripts purgés…
- **UI** : une section « Sessions atypiques » dans la page Analytics (tableau, lien vers la session, puces par indicateur dépassé) et, dans la Vue d'ensemble d'une session atypique, un encadré qui liste ses dépassements.
- Outil MCP `get_session_diagnostic` et commande `ccam diagnostic`, qui exposent la même route pour garder la parité CLI/MCP du projet.

### C. Récapitulatif des fonctionnalités

- `docs/FEATURES.md` en français : une page courte, organisée par besoin (« je veux voir ce qui tourne », « je veux savoir combien ça coûte »…), qui renvoie vers l'écran, la commande `ccam` ou l'outil MCP correspondant. Le fichier est lié depuis `docs/README.md`.

## Hors champ

- Pas de modification de `~/.claude` ni d'édition de config (piste AURA écartée).
- Pas de courbe de contexte pour Codex ni Cursor (format de transcript différent), ni pour les sous-agents dans cette version.
- Pas d'alerte temps réel sur le diagnostic : le moteur d'alertes existant reste inchangé.
- Pas de persistance des seuils ni de réglage utilisateur dans cette version.

## Contraintes

- Aucun changement de schéma SQLite. Aucun nouveau type de message WebSocket.
- Les formes de réponse existantes de `/transcript` restent compatibles : on ajoute un `type: "session_event"` avec `event_kind: "compaction"`, un type que le client connaît déjà via `rename`.
- Toutes les nouvelles chaînes d'interface existent dans toutes les langues (skill `i18n-parity`).
- En-tête `@file` sur chaque nouveau fichier source.
- Documentation mise à jour (skill `update-project-docs`) : API, CLI, MCP et README avec leurs miroirs.

## Choix laissés à l'implémentation

- La bibliothèque de graphiques : celle déjà utilisée dans le client.
- L'emplacement précis des blocs dans les écrans, tant que c'est cohérent avec l'existant.
