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
mnotes graph related --node-id <id> [--limit <n>]
```

### Backlinks — who links to this note?
```bash
mnotes graph backlinks --node-id <id>
```

### Outgoing links from a note
```bash
mnotes graph links --node-id <id>
```

### Shortest path between two nodes
```bash
mnotes graph find-path --from-id <a> --to-id <b> [--max-depth <n>]
```

### Arbitrary traversal
```bash
mnotes graph traverse --start-id <id> --depth <n> [--edge-type <type>] [--direction in|out|both]
```

### Inspect a node, or get the populated subgraph
```bash
mnotes graph get --node-id <id>
mnotes graph populate --node-id <id>
```

### Mutate the graph (rarely needed; agent-driven ingestion usually handles this)
```bash
mnotes graph create-node --type <t> --data '<json>'
mnotes graph create-edge --from-id <a> --to-id <b> --type <t>
mnotes graph delete-node --node-id <id>
mnotes graph delete-edge --edge-id <id>
```

## Tips
- Start with **related** for "what should I look at next"; use **neighbors**/**backlinks** for explicit structural questions.
- Depth > 2 returns large result sets — page or filter by `--edge-type`.
- For workspace-wide topic groupings, use `/mnotes:moc` to generate a Map of Content instead of raw traversal.
