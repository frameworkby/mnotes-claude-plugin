---
name: note
description: Create, read, update, delete, or list m-notes notes. Use when the user says /note or asks to manage notes (CRUD) directly — write a new note, edit an existing one, fetch a note by id, or list notes in the workspace.
---

# Manage Notes in m-notes

Run the appropriate `mnotes note` subcommand via Bash. These are the raw note CRUD operations — for storing/recalling structured knowledge entries, prefer `/mnotes:store` and `/mnotes:recall`.

The CLI exposes note CRUD in two equivalent surfaces:

- **Group form** — `mnotes note <action>` (recommended).
- **Top-level shortcuts** — `mnotes create`, `mnotes read <id>`, `mnotes update <id>`, `mnotes delete <id>` (legacy aliases). Note that the top-level shortcuts use `--folder-id <id>` while the group form uses `--folder <id>` — pick one form per command and stick with it.

## List

```bash
mnotes note list [--folder-id <id>] [--limit <n>] [--cursor <c>]
```

## Read

```bash
mnotes note get <id>
# or top-level alias: mnotes read <id>
```

## Create

`mnotes note create` accepts content either via `--content` or piped on stdin.

```bash
# Group form, --folder
mnotes note create --title "<title>" [--folder <id>] [--tags tag1 tag2] [--content "<markdown>"]

# Top-level alias, --folder-id, stdin content
echo "# Heading" | mnotes create --title "<title>" [--folder-id <id>]

# Heredoc for multi-line bodies
mnotes note create --title "Meeting Notes" <<'MD'
# Agenda
- Item 1
- Item 2
MD
```

## Update

```bash
mnotes note update <id> [--title "<new title>"] [--folder <id>] [--content "<markdown>"]
# Body can also be piped on stdin to replace content.
```

## Delete

```bash
mnotes note delete <id>
# or top-level alias: mnotes delete <id>
```

## Search

```bash
mnotes note search "<query>" [--semantic] [--limit <n>]
```

`<query>` is a positional argument — there is no `--query` flag.

## Tips
- Titles with slashes (e.g. `wiki/index`) trigger a slash-warning unless a folder is provided; this is intentional — pick a folder or accept the slash as part of the title.
- Add `--json` to any command for parseable output.
- For per-note operations like pin, star, archive, frontmatter, or version history, use `mnotes note-ops <action>`.
