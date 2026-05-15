---
name: setup
description: Interactive m-notes setup. Use when the user says /setup, "set up mnotes", "configure mnotes", or "initialize m-notes".
---

# Set Up m-notes

Walk the user through connecting this project to m-notes. This skill is conversational — ask for missing input rather than failing silently.

## Steps

### 1. Check CLI availability

```bash
mnotes --version
```

If the command is not found, the `bin/mnotes` wrapper in this plugin will auto-fetch via `npx`. If the wrapper is also missing, instruct the user to run:

```bash
npm install -g mnotes
```

### 2. Check authentication

```bash
ls ~/.mnotes/config.json
```

If the file does not exist, authenticate:

```bash
mnotes login
```

Ask the user for their m-notes API URL and API key. Pass them when prompted or via environment variables `MNOTES_API_URL` and `MNOTES_API_KEY`.

### 3. List workspaces

```bash
mnotes workspace list
```

Show the available workspaces. If the user wants a new one:

```bash
mnotes workspace create --name "<name>"
```

### 4. Link workspace to project

Run this inside the current project directory to bind it:

```bash
mnotes workspace link
```

### 5. Bootstrap wiki notes if absent

`mnotes note search` takes the query as a positional argument (no `--query` flag).

   - `mnotes note search "wiki/index"` — if no result, run `mnotes note create --title "wiki/index" --content "# Wiki Index\n\nTop-level entry point for the workspace wiki."`
   - `mnotes note search "wiki/log"` — if no result, run `mnotes note create --title "wiki/log" --content "# Wiki Log\n\nAuto-appended log of ingest / query / lint operations."`

Content can also be piped on stdin instead of `--content`:

```bash
echo "# Wiki Index" | mnotes note create --title "wiki/index"
```

### 6. Verify round-trip

```bash
mnotes kb recall --query "test"
```

Or:

```bash
mnotes connect --status
```

If the command succeeds, the integration is working.

### 7. Done

Tell the user that `/mnotes:store` and `/mnotes:recall` are now ready to use in this project. The `SessionStart` and `PostToolUse` hooks will run automatically going forward.
