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
| Operating system | Windows (PowerShell or cmd.exe), macOS, and Linux all supported — no WSL required |
| `mnotes` CLI | Auto-fetched via `npx` if not globally installed (see `bin/mnotes` wrapper) |
| m-notes account | Run `mnotes login` once, or use `/mnotes:setup` to walk through it interactively |

---

## What It Ships

Plugin runs natively on Windows since v1.4.0 — hook scripts and CLI wrapper are Node-based.

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
| Hook `PostToolUse` | Auto after Bash / Read / Edit / Write tool calls | Auto-appends wiki log entries; see [PostToolUse hook](#posttooluse-hook) below |

---

## PostToolUse hook

`hooks/scripts/mnotes-post-tool-use.sh` listens to Claude Code's PostToolUse events and appends a `mnotes wiki log` entry for the tool calls below. Always exits `0` so it never blocks Claude Code.

### Tool family → log mapping

| Tool family | `--kind` | `--ref` | Notes |
|---|---|---|---|
| Bash: `mnotes note create / update`, `note-ops append` | `ingest` | `--title` or stdout head | Legacy (v1.0+) |
| Bash: `mnotes search`, `recall-knowledge`, `kb recall`, `bulk knowledge-recall` | `query` | `--query` or first positional | Legacy (`kb recall` added in v1.2.1) |
| Bash: `mnotes wiki lint`, `kb scan-conflicts` | `lint` | check name or `all` | Legacy |
| Read | `ingest` | `file_path` | New in v1.3.0 |
| Edit / Write — ordinary path | `ingest` | `file_path` | New in v1.3.0 |
| Edit / Write — `CLAUDE.md`, `.claude/settings(.local)?.json`, `presets/*/CLAUDE.md` | `decision` | `file_path` | New in v1.3.0 |
| Bash: `git checkout -b`, `git commit`, `gh pr create / merge`, `gh release create`, `(npm\|pnpm\|yarn) publish` | `decision` | branch name or command | New in v1.3.0; allowlist below |
| Anything else | *(skipped)* | — | Silent — no log |

### Dedup and rate cap

- **5-minute dedup window**: identical `(kind, ref)` pairs within 300 seconds are skipped.
- **30-per-session cap**: after 30 logged entries in one Claude Code session, the hook stops emitting until the session rolls over.

### Environment-variable extension points

| Variable | Effect |
|---|---|
| `MNOTES_HOOK_DECISION_ALLOW` | Comma-separated extra regexes appended to the Bash decision allowlist. Example: `'^terraform[[:space:]]+apply,^kubectl[[:space:]]+apply'` |
| `MNOTES_HOOK_DECISION_PATHS` | Comma-separated extra regexes appended to the Edit/Write decision-path list. Example: `'(^\|/)Dockerfile$,(^\|/)docker-compose\.yml$'` |
| `MNOTES_HOOK_DEBUG=1` | Append a debug line per emission to `~/.claude/plugins/mnotes/state/postusetool.debug.log`. |

### Verifying locally

```bash
bash scripts/test-post-tool-use.sh
```

Runs the 34-case smoke test covering every tool family above, env-var extension, and the rate-cap invariant. Wired into CI (`.github/workflows/ci.yml`).

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

## Platform notes

| Platform | Details |
|---|---|
| Windows | Works in PowerShell and cmd.exe. State dir is `%USERPROFILE%\.claude\plugins\mnotes\state`. Hooks invoke `node` directly via `${CLAUDE_PLUGIN_ROOT}/hooks/scripts/*.mjs` — no shell required. |
| macOS / Linux | Unchanged behavior. State dir is `~/.claude/plugins/mnotes/state`. |

---

## Versioning

This plugin is versioned independently from the m-notes app (`vN`) and the CLI (`cli-vX.Y.Z`). Plugin releases use `vX.Y.Z` tags on this repo. `v1.4.0` is the Windows-support release.

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
