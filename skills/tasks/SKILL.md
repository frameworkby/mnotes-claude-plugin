---
name: tasks
description: List or toggle tasks parsed from m-notes notes (markdown checkboxes). Use when the user says /tasks or asks for open todos, action items from notes, or wants to check off a task.
---

# Tasks from m-notes Notes

The m-notes server extracts markdown checkbox items (`- [ ] …` / `- [x] …`) from notes and surfaces them as tasks. Run `mnotes task <action>` via Bash.

## List tasks

```bash
mnotes task list [--status open|done|all] [--note-id <id>] [--tag <tag>] [--limit <n>]
```

Default returns open tasks across the workspace.

## Toggle a task (mark done / undone)

```bash
mnotes task toggle --task-id <id>
```

The server updates the underlying note's markdown in place — the source of truth stays in the note body.

## Tips
- Each task carries a `noteId` and `line` — link the user back to the source note when reporting.
- For a daily roundup of open tasks, use `mnotes note-ops daily-digest`.
- Tasks are parsed on note write; if newly added items don't appear, ensure the note was saved (not just edited locally).
