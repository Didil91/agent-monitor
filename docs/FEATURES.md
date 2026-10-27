# Ce que permet Agent Monitor

Un récapitulatif court, rangé par besoin. Pour chaque besoin : l'écran du dashboard, la
commande `ccam` équivalente et, quand il existe, l'outil MCP. Le détail de chaque
fonctionnalité se trouve dans le [README](../README.md#features).

Le dashboard suit **Claude Code**, **Codex** et **Cursor**. Les données arrivent par les
hooks de Claude Code, la lecture des transcripts locaux et, en option, des machines
distantes en SSH. Tout est stocké en local dans SQLite.

---

## Voir ce qui tourne en ce moment

| Besoin | Où | Terminal |
| --- | --- | --- |
| Les sessions et agents actifs, leur outil en cours | **Tableau de bord** (onglet Monitor) | `ccam stats`, `ccam status` |
| Qui travaille, qui attend une réponse de ma part | **Tableau Kanban** (colonnes En cours / En attente / Terminé / Erreur) | `ccam kanban` |
| Le flux d'événements en direct | **Flux d'activité** (pause, filtres) | `ccam tail [--session id]` |
| Être prévenu quand un agent attend ou échoue | Notifications du navigateur (Web Push), sons discrets | — |
| La charge de la machine par session (CPU de Claude) | Pastille machine en haut du dashboard | — |

## Comprendre une session

| Besoin | Où | Terminal |
| --- | --- | --- |
| Retrouver une session (recherche, filtres, tri par coût ou durée) | **Sessions** | `ccam sessions [--status s] [--q texte]` |
| Son résumé : outils, sous-agents, tokens, erreurs, durée | **Session › Agents** (vue d'ensemble) | `ccam session <id>` |
| Relire la conversation, avec les vrais expéditeurs (vous, l'assistant, un outil, le système) | **Session › Conversation** | `ccam transcript <id>` |
| L'arbre des sous-agents et ce que chacun a fait | **Session › Agents** | `ccam agents --session <id>` |
| La chronologie complète des événements | **Session › Chronologie** | `ccam events --session <id>` |
| **Voir le contexte se remplir et les compactions** | **Session › Agents** : courbe « Fenêtre de contexte », une marque numérotée par compaction, et la liste avant → après | API `GET /api/sessions/:id/context-timeline` |
| **Savoir ce qu'une compaction a remplacé** | **Session › Conversation** : une couture ambrée à l'endroit de la compaction ; le résumé injecté est replié | — |

## Savoir combien ça coûte

| Besoin | Où | Terminal |
| --- | --- | --- |
| Le coût total, par modèle, par jour | **Analyses › Analyse des coûts** | `ccam cost` |
| Le coût d'une session | En-tête de la session, tableau « Détail des coûts » | `ccam cost --session <id>` |
| Les tokens consommés (entrée, sortie, cache) | **Analyses › Analyse des tokens** | `ccam analytics` |
| Ajuster les prix des modèles | **Paramètres › Tarifs Claude** (et Cursor, GPT) | `ccam pricing`, `ccam pricing set …` |

## Repérer ce qui sort de l'ordinaire

| Besoin | Où | Terminal / MCP |
| --- | --- | --- |
| **Les sessions bien au-dessus de mes habitudes** (coût, tokens, durée, compactions, appels d'outils) | **Analyses › Sessions atypiques** (7, 30 ou 90 jours). Seuil = le plus haut entre votre P90 et un plancher fixe | `ccam diagnostic [--days n]` · MCP `dashboard_get_session_diagnostic` |
| Pourquoi une session précise ressort | Encadré « Cette session ressort » dans sa vue d'ensemble | — |
| Être alerté sur une règle (inactivité, statut qui dure, seuil de tokens, motif d'événement) | **Paramètres › Alertes** | `ccam alerts`, `ccam rules` |
| Recevoir ces alertes ailleurs (Slack, Discord, Teams…) | **Paramètres › Alertes** (webhooks) | `ccam webhooks` |

## Analyser sa façon de travailler

| Besoin | Où | Terminal |
| --- | --- | --- |
| Productivité : sessions par jour, issues, outils les plus utilisés | **Analyses › Analyse de productivité** | `ccam analytics` |
| Orchestration des agents, enchaînements d'outils, motifs récurrents | **Workflows** et **Analyses › Intelligence des workflows** | `ccam workflows [--session id]` |
| Les runs de l'outil Workflow (flottes d'agents) | **Workflows** | `ccam runs` |

## Piloter des agents depuis le dashboard

| Besoin | Où | Terminal |
| --- | --- | --- |
| Lancer Claude Code ou Codex avec une interface de chat | **Lancer un agent** | `ccam run start …` |
| Voir et modifier la config de Claude Code ou Codex (skills, agents, hooks, MCP, réglages) | **Config. de l'agent** | — |

## Brancher d'autres outils

| Besoin | Où |
| --- | --- |
| Interroger le dashboard depuis Claude ou un autre client MCP | Serveur MCP local (`npm run mcp:start`), voir [MCP.md](./MCP.md) |
| Tout faire depuis le terminal | CLI `ccam` (`ccam help`), voir [CLI.md](./CLI.md) |
| Appeler l'API directement | API REST documentée sur `/api/docs` (Swagger) et `/api/redoc`, voir [API.md](./API.md) |
| Suivre plusieurs machines | **Paramètres › Sources de données distantes** (SSH) ou envoi depuis un portable (push) |
| Grafana / Prometheus | Endpoint `/api/metrics`, voir [DEPLOYMENT.md](./DEPLOYMENT.md) |

## Garder et déplacer ses données

| Besoin | Où | Terminal |
| --- | --- | --- |
| Importer l'historique existant de `~/.claude` ou Codex | **Paramètres › Importer l'historique** | `ccam import rescan` |
| Exporter ou restaurer toutes les données | **Paramètres › Gestion des données** | `ccam export`, `ccam import-data <fichier>` |
| Nettoyer les vieilles sessions | **Paramètres › Gestion des données** | `ccam cleanup --hours N --days M` |
| Vérifier que tout est bien branché (hooks, base, serveur) | **Paramètres › Configuration des hooks** | `ccam doctor` |
| Savoir si une mise à jour existe | Bandeau dans le dashboard | `ccam update-check` |

Les transcripts que Claude Code supprime au bout de 30 jours restent consultables dans le
dashboard : il en garde une copie au moment de l'import.

---

## Installer et lancer

```bash
npm run setup        # installe tout, les hooks et la commande ccam
npm run dev          # développement (serveur + client avec rechargement)
npm run build && npm start   # production
```

Ensuite : <http://localhost:4820>. Une app de bureau (macOS, Windows) et une image Docker
existent aussi, voir le [README](../README.md#quick-start).
