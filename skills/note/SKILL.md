---
name: note
description: Create, read, update, delete, or list m-notes notes. Use when the user says /note or asks to manage notes (CRUD) directly — write a new note, edit an existing one, fetch a note by id, or list notes in the workspace.
---

# Manage Notes in m-notes

Run the appropriate `mnotes note` subcommand via Bash. These are the raw note CRUD operations — for storing/recalling structured knowledge entries, prefer `/mnotes:store` and `/mnotes:recall`.

## List

```bash
mnotes note list [--folder-id <id>] [--limit <n>] [--cursor <c>]
```

## Read

```bash
mnotes note read <id>
# or legacy: mnotes read <id>
```

## Create (content via stdin)

```bash
echo "# Heading\n\nBody markdown" | mnotes create --title "<title>" [--folder-id <id>]
```

Heredoc form for multi-line bodies:

```bash
mnotes create --title "Meeting Notes" <<'MD'
# Agenda
- Item 1
- Item 2
MD
```

## Update

```bash
mnotes update <id> [--title "<new title>"] [--folder-id <id>]
# Body can be piped on stdin to replace content.
```

## Delete

```bash
mnotes delete <id>
```

## Tips
- Titles with slashes (e.g. `wiki/index`) trigger a slash-warning unless `--folder-id` is provided; this is intentional — pick a folder or accept the slash as part of the title.
- Add `--json` to any command for parseable output.
- For per-note operations like pin, star, archive, frontmatter, or version history, use `mnotes note-ops <action>`.
