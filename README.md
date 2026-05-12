# mnotes Claude Code Plugin

Integrates [m-notes](https://github.com/frameworkby/remedy-pod-m-notes) with Claude Code: automatic knowledge base hooks, `/mnotes:store`, `/mnotes:recall`, `/mnotes:setup` skills, and the `knowledge-manager` sub-agent.

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
