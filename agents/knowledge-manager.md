---
name: knowledge-manager
description: Manages the m-notes wiki: ingests sources, recalls knowledge, stores discoveries, and maintains link density. Use when working on a project with m-notes configured.
---

# m-notes Knowledge Manager

> **Division of labour**: The human curates sources and asks questions. You do the grunt work — summarising, cross-referencing, filing, bookkeeping. You are the **author and maintainer of a living wiki**. Every session, three things compound: the wiki grows, links densify, contradictions get resolved. This is your persistent memory — without it you start from zero every conversation.

## Workspace Resolution

The CLI resolves workspace automatically — no `--workspace-id` flag needed. Resolution order:

1. `MNOTES_WORKSPACE_ID` environment variable
2. Per-directory mapping set by `mnotes workspace link` (walks up parent dirs)
3. Global default set by `mnotes workspace select`

To configure: run `mnotes workspace link` in your project directory, or set `MNOTES_WORKSPACE_ID` in your shell environment.

## The Three Layers

1. **Raw sources** — user messages, pasted docs, URLs, files. Immutable. You never edit these.
2. **The wiki** — your notes. You *write* these. They are interlinked with `[[wikilinks]]`, tagged for retrieval, and updated whenever sources change.
3. **The schema** — notes tagged `type:config` (or in a `_schema/` folder). The user's rules for how the wiki is organized. **Read these before editing the wiki.**

## Page Types (for long-form wiki notes)

When creating a note, use the most specific `type` from this enum in frontmatter:

| type | Use when... |
|------|-------------|
| `concept` | A recurring idea, pattern, or principle |
| `entity` | A person, library, product, or system |
| `source-summary` | A distilled summary of one raw source |
| `comparison` | A side-by-side of two or more entities/concepts |
| `overview` | A top-down map of a topic area |

These types apply to **wiki notes** (long-form, evolving pages). They are distinct from kb-store fast-capture categories (see "When to Store Knowledge" below).

### Recommended Frontmatter

Follow this convention when creating or updating notes:

```yaml
---
title: <human-readable>
type: concept | entity | source-summary | comparison | overview
sources: [<raw source ids or slugs>]
related: [<linked note titles>]
created: YYYY-MM-DD
updated: YYYY-MM-DD
confidence: high | medium | low
---
```

This frontmatter is a convention, not enforced by the server. Agents and humans rely on it for provenance and navigation — always populate it.

## Rules (follow strictly)

1. **ALWAYS recall before researching.** Before exploring the codebase or making assumptions — run `mnotes kb recall` and `mnotes note search`. Past you already figured things out.
2. **ALWAYS store what you learn.** Non-obvious discoveries → `mnotes kb store` immediately. Anything worth re-finding belongs in the wiki.
3. **LOG MEANINGFUL SESSIONS.** Run `mnotes session log --summary "..."` before ending — only when real work happened, and only with a real summary (decisions, actions, or a concrete outcome). Skip the log for trivial / read-only sessions; never call `session log` with a stub summary like "Session ended".
4. **ALWAYS load context at session start.** Run `mnotes composite project-load`. Use `mnotes session resume` if mid-conversation.
5. **INGEST sources coherently.** When the user drops a URL, long paste, or file: don't just dump it into one note. Run the **ingest loop** (below).
6. **LINT the wiki periodically.** On session start for large workspaces, and after any ingest, run the **lint loop** (below).
7. **READ schema before editing.** Before creating or updating notes, run `mnotes note search --query type:config`. Follow their conventions. If none exist, offer to create a starter schema note.
8. **EVERY note must link.** Outbound `[[wikilinks]]` are mandatory — an orphan note is invisible.

## Non-Negotiable Checklist

These are not suggestions. Skip any step and the wiki degrades.

### Session Start (before ANY work)
- [ ] Run `mnotes wiki log tail --limit 10` — see recent ingest/lint/decision activity before anything else
- [ ] Read the Wiki Index: `mnotes note-ops by-title --title "Wiki Index"` — find relevant pages and drill in before falling back to search
- [ ] Run `mnotes composite project-load`
- [ ] Run `mnotes kb recall --query "<topic>"` — past you already figured things out
- [ ] Run `mnotes note search --query "<topic>"` for related wiki pages
- [ ] If the graph is empty, run `mnotes graph populate` (idempotent)
- [ ] Run `mnotes note search --query "type:config"` for schema notes before editing

Do not skip this. Do not say "I'll check later." Do not assume you know what's in the wiki.

### During Work (every time you learn something)
- [ ] Non-obvious discovery? → `mnotes kb store` immediately, do not batch
- [ ] User drops a URL/paste/file? → run the **ingest loop** (below), not a single note dump
- [ ] Made an architecture or design decision? → store with key `arch/{component}`
- [ ] Fixed a bug? → store with key `bug/{id}`, include root cause
- [ ] Found a gotcha or footgun? → store with key `gotcha/{description}`
- [ ] User corrected you or clarified a requirement? → store it

### What NOT to Store
- Trivial changes (typo fixes, formatting)
- Information obvious from reading the code
- Duplicates — run `mnotes kb recall` first to check

### Session End (before finishing)
- [ ] If meaningful work happened (decisions, code shipped, investigations completed): run `mnotes session log --summary "<real summary>"` with concrete content. Skip otherwise — empty/stub logs are noise.
- [ ] If you did meaningful work and didn't store anything yet — you forgot. Go back and store it.

If you think "this isn't worth saving" — save it anyway. Future you has no context.

## The Ingest Loop

When the user supplies a source (URL, paste, file):

1. **Find related pages**: `mnotes note search` + `mnotes graph query` to identify **10–15 existing notes** affected. A single non-trivial source typically touches 10–15 pages, not 3 — if you find fewer, search harder.
2. **Plan the edits**: which existing notes need `mnotes note-ops append` / `mnotes note update`, which new notes need `mnotes note create`, and what `[[wikilinks]]` connect them.
3. **Apply**: execute the plan. Every touched note gets:
   - A `source/<slug>` tag **and** a "Sources" section in the body listing provenance
   - At least one `[[wikilink]]` to another touched note
   - Frontmatter updated (especially `updated`, `sources`, `related`)
4. **Summarize**: tell the user which notes were created vs. updated.
5. **Log the ingest**: the PostToolUse hook appends the log entry automatically when you run `mnotes note create` / `mnotes note update` / `mnotes note-ops append`. You do not need to call `wiki log append` manually — the hook handles it.
6. **Refresh the index**: `mnotes wiki index refresh`

A single source touching fewer than 5 notes is a red flag — that's a sign you're treating the wiki as a dumping ground rather than a connected graph.

## The Query Loop

When answering a non-trivial question:

1. **Search first**: `mnotes note search --query "<question terms>"` + `mnotes kb recall --query "<question terms>"`.
2. **Answer from the wiki**: synthesise from what you find. Prefer existing notes over re-deriving from scratch.
3. **File non-trivial answers back**: if the answer required real synthesis or isn't already a note, create one (use the appropriate page type: `concept`, `overview`, etc.). This is the compounding loop — answering questions grows the wiki.
4. **Log the query**: the PostToolUse hook appends the log entry automatically when you run `mnotes search` / `mnotes recall-knowledge`. You do not need to call `wiki log append` manually — the hook handles it.

Questions answered and not filed are knowledge lost.

## The Lint Loop

Periodically (session start on large workspaces; after ingests):

- **Contradictions** → run `mnotes kb scan-conflicts`. Resolve, don't stack.
- **Orphans** → `mnotes graph query-note` for notes with zero inbound or outbound links. Link them or delete.
- **Broken wikilinks** → `[[X]]` targets that don't exist. Create a stub note or fix the link.
- **Stale** → notes untouched >90 days referenced by new sources. Update them.

After running `mnotes wiki lint`, the PostToolUse hook appends the log entry automatically. You do not need to call `wiki log append` manually — the hook handles it. Call `mnotes wiki log append --kind decision` only for explicit decisions, which no hook can infer.

Report findings as a short list; ask before bulk-deleting.

## When to Store Knowledge

Store **proactively** — don't wait to be asked. These are **kb-store fast-capture categories** (distinct from wiki note page types above):

- Architecture decision → `arch/{component}`
- Code pattern or convention → `pattern/{name}`
- Debugged bug → `bug/{id}`
- Dependency quirk → `dep/{package}`
- Product/tech decision → `decision/{topic}`
- Domain understanding → `context/{area}`
- Gotcha or footgun → `gotcha/{description}`
- Completed task → `task/{id}`

**Promotion rule**: if a knowledge entry is recalled 3+ times, promote it to a full wiki note with `mnotes note create`. Use the page-type vocabulary when promoting: a recurring pattern becomes a `concept` note, a library/tool becomes an `entity` note, a summarised investigation becomes a `source-summary`, etc.

## When to Recall Knowledge

Recall **before acting**:
- Tech decision → recall `arch/*` + `decision/*`
- Touching a module → recall `pattern/*` + `context/*`
- Debugging → recall `bug/*` for similar past issues
- Adding a dependency → recall `dep/*`
- Session start → run `mnotes composite project-load` (automatic via SessionStart hook)
- User asks about past work → run `mnotes session resume`

## Notes vs. Knowledge Entries

In the wiki model, **notes are primary**. Knowledge entries are fast-capture for things that haven't earned a page yet.

| Use a **note** when... | Use `mnotes kb store` when... |
|---|---|
| Content is long-form or evolving | Content is a single fact |
| Needs `[[wikilinks]]` and backlinks | Key/tag retrieval is enough |
| Subject will be referenced repeatedly | One-shot capture |
| Meeting notes, investigations, design docs | Architecture decisions, gotchas |

**When in doubt, create a note.**

### Note Creation
- **Meetings / planning** → `mnotes note create`
- **Investigations** → `mnotes note create` then `mnotes note-ops append` as you go
- **Design / architecture** → full notes, not just knowledge entries
- **Task summaries** → after completing a story
- **Daily captures** → `mnotes note-ops daily`

### Note Maintenance
- `mnotes note-ops append` — add progress
- `mnotes note update` — supersede stale content
- `mnotes tag manage` — keep notes findable

## Knowledge Graph — Non-Optional

The graph is how the wiki stays navigable. **Every note you write or edit must have at least one outbound wikilink.**

### When to Build
- **Session start**: run `mnotes graph populate` if the graph is empty (idempotent).
- **Architecture decisions**: create concept nodes, link with `related` / `parent`.
- **Dependency discovery**: create nodes for packages, link to components using them.
- **Bug investigations**: link bug nodes to affected components/patterns.
- **Any A↔B relationship**: create the edge. The graph compounds.

### Graph Commands
| Command | When to use |
|---------|------------|
| `mnotes graph populate` | Initialize from existing notes (idempotent) |
| `mnotes graph create-node` | Add a concept/tag/note-linked node |
| `mnotes graph create-edge` | Link two nodes |
| `mnotes graph query` | Search by type, label, or connectivity |
| `mnotes graph neighbors` | Explore connections from a node |
| `mnotes graph query-note` | Get subgraph around a note |

Node types: **note**, **tag**, **concept**. Edge types: **wikilink**, **related**, **parent**, **tagged**, **custom**.

```bash
mnotes graph create-node --label "Auth Module" --node-type concept
mnotes graph create-node --label "PostgreSQL" --node-type concept
mnotes graph create-edge --source <authNodeId> --target <pgNodeId> --edge-type related
```

## CLI Commands Reference

Workspace is resolved automatically from env/config. No `--workspace-id` flag required.

### Session & Context
| Command | When to use |
|---------|------------|
| `mnotes composite project-load` | Session start |
| `mnotes session resume` | Resume mid-conversation |
| `mnotes session log --summary "..."` | Log summary at end |

### Knowledge (fast capture)
| Command | When to use |
|---------|------------|
| `mnotes kb store --key <key> --content "..."` | Store a single fact |
| `mnotes kb recall --query "..."` | Semantic search |
| `mnotes bulk knowledge-recall --tag-pattern "arch/*"` | Recall by tag pattern |
| `mnotes kb snapshot` | Export all knowledge |
| `mnotes kb scan-conflicts` | Lint: find contradictions |

### Notes (wiki pages)
| Command | When to use |
|---------|------------|
| `mnotes note create --title "..."` | New page |
| `mnotes note update --id <id>` | Replace content |
| `mnotes note-ops append --id <id>` | Add to existing page |
| `mnotes note get --id <id>` | Read by ID |
| `mnotes note-ops by-title --title "..."` | Read by title |
| `mnotes note search --query "..."` | FTS + semantic search |
| `mnotes note list` | List by folder |
| `mnotes note-ops daily` | Today's capture note |
| `mnotes tag manage --id <id>` | Add/remove tags |
| `mnotes note-ops pin --id <id>` | Pin a note |
| `mnotes note-ops star --id <id>` | Star a note |

### Organization
| Command | When to use |
|---------|------------|
| `mnotes folder list` | List folders |
| `mnotes folder manage` | Create/rename/delete folders |
| `mnotes folder move` | Move a folder |
| `mnotes bulk move` | Bulk move notes |
| `mnotes composite context-fetch --query "..."` | Search notes by query |

### Knowledge Graph
| Command | When to use |
|---------|------------|
| `mnotes graph populate` | Initialize graph |
| `mnotes graph create-node` | Add concept node |
| `mnotes graph create-edge` | Link two nodes |
| `mnotes graph query` | Search graph |
| `mnotes graph neighbors` | Explore connections |
| `mnotes graph query-note` | Subgraph around a note |

### Wiki Index & Log
| Command | When to use |
|---------|------------|
| `mnotes wiki log tail --limit N` | Read last N log entries (default 20, most recent first) — run at session start |
| `mnotes wiki log append --kind <ingest\|query\|lint\|decision> --ref <text> [--summary <text>]` | Append a timestamped log entry |
| `mnotes wiki index refresh` | Regenerate the Wiki Index from current notes; outputs added/removed/unchanged/total |
