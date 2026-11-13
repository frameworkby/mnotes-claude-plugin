---
name: board
description: Track work on the m-notes task board (kanban): create, pick up, move, comment on and finish tasks. Use when starting multi-step work in a repo with m-notes configured, when the user says /board, or asks what's on the board, what's in progress, or to create/move/assign a task.
---

# Track Work on the m-notes Board

The board is a real kanban task tracker shared by humans (web app) and agents (CLI). Run `mnotes board <action>` via Bash. Workspace is resolved automatically from the CLI config.

Not the same as `/mnotes:tasks` — that one only reads and toggles markdown checkboxes inside notes.

**Statuses** (board order): `backlog`, `todo`, `in_progress`, `review`, `done`.
**Priorities**: `none` (default), `low`, `medium`, `high`, `urgent`.

## Workflow for agents

When you start multi-step work (a feature, bug fix, refactor, investigation) in a repo with m-notes configured:

1. **Find or create the task.** Check the board for an existing one first:
   ```bash
   mnotes board list --status todo,in_progress --q "<keywords>"
   ```
   Query commands show related tasks too — check them: `mnotes search`, `mnotes note search` and `mnotes kb recall` end with a **Related tasks** footer, and with `--json` every query command (including `mnotes kb ask`) returns a `relatedTasks` field.
   Reuse a matching task. Otherwise create it:
   ```bash
   mnotes board create "<short imperative title>" --description "<goal, scope, acceptance>" --assignee claude-code
   ```
2. **Start it.** Assign yourself and move it to `in_progress`:
   ```bash
   mnotes board update <id> --assignee claude-code
   mnotes board move <id> in_progress
   ```
3. **Post progress at milestones** — one or two lines each, not a running log: plan agreed, root cause found, tests passing, PR opened, blocked on X.
   ```bash
   mnotes board comment <id> "Root cause: stale cache key in loader; fix + test in progress"
   ```
4. **Finish it.** Move to `review` when a human needs to check it (PR open, needs sign-off), or `done` when it's complete. Leave a closing comment with the outcome (PR link, what changed, follow-ups).
   ```bash
   mnotes board comment <id> "PR #42 open: …"
   mnotes board move <id> review
   ```

Skip the board for one-shot questions and trivial edits. Status changes and reassignments are recorded on the task automatically — don't comment just to say "moved".

## Commands

```bash
mnotes board list [--status <s1,s2>] [--assignee <name>] [--q <text>] [--limit <n>]
mnotes board create <title> [--description <md>] [--status <s>] [--priority <p>] [--assignee <name>] [--note-id <id>]
mnotes board show <id>          # task + comments/activity, oldest first
mnotes board update <id> [--title <t>] [--description <md>] [--priority <p>] [--assignee <name> | --unassign] [--note-id <id>]
mnotes board move <id> <status> # moves to the end of the target column
mnotes board comment <id> <body>
mnotes board delete <id>
```

- **--status**: on `list`, comma-separated filter; on `create`, the starting column (default `todo`).
- **--q**: case-insensitive match on title/description.
- **--limit**: default 200, max 500.
- **--assignee**: free text — a member's name or an agent name. Agents use `claude-code`.
- **--note-id**: link an m-notes note (design doc, investigation) to the task. Note must be in the same workspace. Repeatable. On `update` it **replaces** the whole set of linked notes — pass every id to keep (read the current ones with `mnotes board show <id>`).

## Tips
- `mnotes board show <id>` before resuming a task someone else touched — the comments show who did what.
- Link the notes you write while working (`--note-id`) so the task points at the knowledge. When adding one on `update`, include the already-linked ids too.
- Don't delete tasks you didn't create; move them back to `todo` or `backlog` instead.
