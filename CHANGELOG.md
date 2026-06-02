# mnotes-claude-plugin changelog

All notable changes to the m-notes Claude Code plugin are documented here.

## 1.5.0 — 2026-06-02

### Add — Graphiti-parity temporal-graph skills

- **`/mnotes:facts`** — extract and browse the bi-temporal knowledge graph:
  drives `mnotes graph extract [--full]`, `mnotes graph facts`, and
  `mnotes graph traverse-facts`.
- **`/mnotes:recall-at`** — point-in-time recall ("what was true as of `<date>`",
  "who was CEO in 2024"), driving `mnotes graph facts --as-of <ISO>` and
  `mnotes graph traverse-facts ... --as-of <ISO>`, with citations via
  `statement` + `sourceNoteId`.

`plugin.json` `description` now enumerates `facts` and `recall-at`; the README
asset table documents both new skills.

### Notes

- These skills require **mnotes-cli >= 4.3.0** (the release that adds the
  `graph extract` / `graph facts` / `graph traverse-facts` subcommands). The
  CI `check-mnotes-refs.mjs` validation pins an older CLI and will fail until
  the pinned CLI version is bumped to 4.3.0.
