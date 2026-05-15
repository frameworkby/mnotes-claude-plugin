# Story #5 — fix(agent+skills): correct knowledge-manager, graph, and store CLI args

**Issue:** [#5](https://github.com/frameworkby/mnotes-claude-plugin/issues/5) · **Milestone:** Sprint 52 · **Size:** S · **Priority:** P2

## Context
The `knowledge-manager` sub-agent recipe and two more skill files have residual wrong/incomplete CLI references.

Source of truth: `mnotes-cli/src/commands/{graph/create-edge,kb/store,note/search}.ts`.

## Tasks
- [ ] `agents/knowledge-manager.md`: replace every `mnotes note search --query "<...>"` with positional form `mnotes note search "<...>"` (~5 occurrences)
- [ ] `agents/knowledge-manager.md`: in the graph example block, change `--source <id>`/`--target <id>` to `--source-id <id>`/`--target-id <id>`; ensure `--edge-type` is used
- [ ] `agents/knowledge-manager.md`: spot-check the quick-reference tables at the bottom against the real CLI and fix any inconsistency
- [ ] `skills/graph/SKILL.md`: replace `graph create-edge --from-id <a> --to-id <b> --type <t>` with `--source-id`, `--target-id`, `--edge-type` (with allowed-values list) and optional `--weight <0..10>`, `--metadata '<json>'`
- [ ] `skills/store/SKILL.md`: document optional `--source <s>` and `--confidence <0..1>` flags; verify `--tags <csv>` is documented as comma-separated

## Acceptance Criteria
1. `rg 'note search --query' agents/ skills/` → no hits.
2. `rg -- '--from-id|--to-id' skills/graph/SKILL.md` → no hits.
3. Every documented `mnotes` command in touched files passes a `--help` smoke check.

## Dev Record
- Branch: _filled by dev_
- PR: _filled by dev_
- Agent calls: _filled by dev_

## QA Review
_filled by qa_
