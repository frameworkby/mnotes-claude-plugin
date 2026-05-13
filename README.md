# mnotes Claude Code Plugin

Integrates [m-notes](https://github.com/frameworkby/remedy-pod-m-notes) with Claude Code: automatic knowledge base hooks, a suite of `/mnotes:*` skills covering the CLI surface, and the `knowledge-manager` sub-agent.

---

## Install

```
/plugin marketplace add frameworkby/mnotes-claude-plugin
/plugin install mnotes@mnotes
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js ≥ 18 | Required by the `mnotes` CLI |
| `mnotes` CLI | Auto-fetched via `npx` if not globally installed (see `bin/mnotes` wrapper) |
| m-notes account | Run `mnotes login` once, or use `/mnotes:setup` to walk through it interactively |

---

## What It Ships

| Asset | Trigger / path | What it does |
|---|---|---|
| Skill `/mnotes:store` | `/mnotes:store` | Stores a knowledge entry via `mnotes kb store` |
| Skill `/mnotes:recall` | `/mnotes:recall` | Recalls knowledge via `mnotes kb recall` |
| Skill `/mnotes:setup` | `/mnotes:setup` | Interactive setup: login, workspace link, verify round-trip |
| Skill `/mnotes:search` | `/mnotes:search` | Full-text or semantic note search (`mnotes search`) |
| Skill `/mnotes:note` | `/mnotes:note` | Note CRUD: list / read / create / update / delete |
| Skill `/mnotes:ask` | `/mnotes:ask` | Synthesized answer + cited sources (`mnotes kb ask`) |
| Skill `/mnotes:ingest` | `/mnotes:ingest` | Batch upsert (up to 50) of knowledge entries from JSON |
| Skill `/mnotes:graph` | `/mnotes:graph` | Graph exploration: neighbors / related / backlinks / paths |
| Skill `/mnotes:moc` | `/mnotes:moc` | Generate a Map of Content for a folder or tag |
| Skill `/mnotes:session` | `/mnotes:session` | Log / replay / resume AI conversation sessions |
| Skill `/mnotes:wiki` | `/mnotes:wiki` | Lint, refresh index, append to `wiki/log` |
| Skill `/mnotes:tasks` | `/mnotes:tasks` | List / toggle tasks parsed from note checkboxes |
| Skill `/mnotes:snapshot` | `/mnotes:snapshot` | Export KB, view stats, scan conflicts, decay/archive |
| Agent `knowledge-manager` | Sub-agent | Full wiki management: ingest, recall, lint, session logging |
| Hook `SessionStart` | Auto on session open | Runs `mnotes composite project-load` and injects context |
| Hook `PostToolUse` (Bash) | Auto after every Bash call | Auto-appends wiki log entries for mnotes CLI calls |

---

## Configuration

Workspace is resolved in this order at runtime — no manual flag required:

1. `MNOTES_WORKSPACE_ID` environment variable
2. Per-directory mapping set by `mnotes workspace link` (walks up parent dirs)
3. Global default set by `mnotes workspace select`

To configure for a project:

```bash
mnotes workspace link   # run inside your project directory
```

Or set the env var in your shell profile:

```bash
export MNOTES_WORKSPACE_ID=your-workspace-id
```

---

## Versioning

This plugin is versioned independently from the m-notes app (`vN`) and the CLI (`cli-vX.Y.Z`). Plugin releases use `vX.Y.Z` tags on this repo.

---

## Uninstall

```bash
claude plugin uninstall mnotes
```

Hook scripts under `~/.claude/plugins/mnotes/` can be removed manually if desired.

---

## Links

- [m-notes repo](https://github.com/frameworkby/remedy-pod-m-notes)
- [mnotes CLI on npm](https://www.npmjs.com/package/mnotes)
- [Claude Code plugin docs](https://code.claude.com/docs/en/plugins-reference)
