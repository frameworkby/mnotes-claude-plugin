---
name: moc
description: Generate a Map of Content (MoC) note for an m-notes folder or tag. Use when the user says /moc or asks for an index/overview/table-of-contents note that links to everything in a folder or tag.
---

# Generate a Map of Content in m-notes

Run `mnotes moc generate` via Bash. Produces (or updates) an MoC note that lists wikilinks to all notes in scope, ordered by embedding similarity, with a one-sentence description per line. Re-running on the same scope updates the existing MoC in place.

## Command

```bash
mnotes moc generate --scope-type folder|tag --scope-id <id-or-tag> [--limit <n>]
```

## Parameters
- **--scope-type** (required): `folder` or `tag`
- **--scope-id** (required): Folder ID (for `folder`) or tag name (for `tag`)
- **--limit**: Max notes to include (1-200, default 50)

## Examples

```bash
# MoC for everything tagged "architecture"
mnotes moc generate --scope-type tag --scope-id architecture

# MoC for a specific folder, larger than default
mnotes moc generate --scope-type folder --scope-id fld_abc123 --limit 150
```

## Tips
- To find a folder ID, run `mnotes folder list`.
- To find tag names, run `mnotes tag list`.
- For a lighter overview (counts + recents) without creating a note, use `mnotes folder summary`.
- After generating, share the resulting MoC note ID with the user so they can open or pin it.
