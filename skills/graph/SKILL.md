---
name: graph
description: Explore the m-notes knowledge graph — neighbors, related notes, backlinks, paths between notes. Use when the user says /graph or asks how notes connect, what links to X, what's related to a note, or to traverse the graph.
---

# Explore the m-notes Knowledge Graph

Run `mnotes graph <action>` via Bash. The graph stores typed edges between notes (and other nodes); use these to surface non-obvious connections.

## Common actions

### Neighbors (one or two hops out)

```bash
mnotes graph neighbors --node-id <id> [--depth 1|2|3] [--edge-type <type>]
```

### Related notes (embedding similarity, not just explicit edges)

```bash
mnotes graph related <id> [--limit <n>] [--min-similarity <0..1>]
```

`<id>` is a positional argument (the source note ID).

### Backlinks — who links to this note?

```bash
mnotes graph backlinks <id>
```

### Outgoing links from a note

```bash
mnotes graph links <id>
```

### Shortest path between two nodes

```bash
mnotes graph find-path --from-node-id <a> --to-node-id <b> [--max-depth <n>]
```

### Arbitrary traversal

```bash
mnotes graph traverse \
  --start-node-id <id> \
  [--max-depth <n>] \
  [--edge-types <csv>] \
  [--node-types <csv>]
```

### Browse the graph (label search) or seed it

```bash
mnotes graph get [--query <label-substring>] [--limit <n>]
mnotes graph populate     # idempotent — initializes nodes/edges from existing notes
```

### Mutate the graph (rarely needed; agent-driven ingestion usually handles this)

```bash
mnotes graph create-node \
  --label "<label>" \
  --node-type note|tag|concept \
  [--note-id <id>] \
  [--metadata '<json-object>']

mnotes graph create-edge \
  --source-id <a> --target-id <b> \
  [--edge-type wikilink|related|parent|tagged|custom] \
  [--weight <0..10>] \
  [--metadata '<json-object>']

mnotes graph delete-node --node-id <id>
mnotes graph delete-edge --edge-id <id>
```

## Tips
- Start with **related** for "what should I look at next"; use **neighbors**/**backlinks** for explicit structural questions.
- Depth > 2 returns large result sets — page or filter by `--edge-type`.
- For workspace-wide topic groupings, use `/mnotes:moc` to generate a Map of Content instead of raw traversal.
