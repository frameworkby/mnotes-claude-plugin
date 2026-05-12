---
name: store
description: Store a knowledge entry in m-notes. Use when the user says /store or asks to save/store knowledge, decisions, patterns, or context.
---

# Store Knowledge in m-notes

Run the `mnotes kb store` CLI command via Bash to save knowledge.

## Command

```bash
mnotes kb store --key "<category>/<name>" --content "<markdown content>" [--tags "<tag1>,<tag2>"]
```

## Parameters
- **--key**: Use the naming convention `<category>/<name>` (e.g., `arch/database`, `decision/auth-provider`, `pattern/error-handling`)
- **--content**: The knowledge to store — be specific and include rationale
- **--tags**: Comma-separated category tags (e.g., `architecture` or `decision,auth`)

Workspace is resolved automatically from the CLI config. Do not pass `--workspace-id`.

## Categories
| Prefix | Use for |
|--------|---------|
| `arch/` | Architecture decisions |
| `pattern/` | Code patterns and idioms |
| `bug/` | Bug investigations and fixes |
| `dep/` | Dependency notes |
| `decision/` | Product/tech decisions |
| `context/` | Project context and domain knowledge |
