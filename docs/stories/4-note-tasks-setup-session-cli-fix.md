# Story #4 — fix(skills): correct note/tasks/setup/session CLI signatures

**Issue:** [#4](https://github.com/frameworkby/mnotes-claude-plugin/issues/4) · **Milestone:** Sprint 52 · **Size:** S · **Priority:** P1

## Context
Four skill files reference CLI commands that either don't exist or use wrong argument names.

Source of truth:
- `mnotes-cli/src/commands/note/{get,create,search}.ts`
- `mnotes-cli/src/commands/task/toggle.ts`
- `mnotes-cli/src/commands/session/save-conversation.ts`

## Tasks
- [ ] `skills/note/SKILL.md`: replace `mnotes note read <id>` with `mnotes note get <id>` (the top-level `mnotes read <id>` may remain as a legacy alias)
- [ ] `skills/note/SKILL.md`: reconcile `--folder-id` (top-level `create`) vs `--folder` (`note create`); label each example with the form it uses
- [ ] `skills/tasks/SKILL.md`: replace `task toggle --task-id <id>` with `task toggle --note-id <id> --task-index <n> [--done | --not-done]`
- [ ] `skills/setup/SKILL.md`: replace `mnotes note search --query "title:wiki/index"` with positional `mnotes note search "wiki/index"`; remove or test the `title:` prefix syntax
- [ ] `skills/setup/SKILL.md`: keep `mnotes note create --title ... --content ...` but mention stdin alternative
- [ ] `skills/session/SKILL.md`: replace `session save-conversation --session-id <id> --content "<md>"` with `--messages '[{"role":"user|assistant","content":"..."}]' [--title <s>] [--source <s>]` and include a JSON example

## Acceptance Criteria
1. Every documented command runs cleanly with `--help` against the real CLI.
2. Each fixed command has at least one usage example.
3. Smoke check: `rg 'note read |--task-id|--session-id --content|note search --query' skills/` returns zero hits.

## Dev Record
- Branch: _filled by dev_
- PR: _filled by dev_
- Agent calls: _filled by dev_

## QA Review
_filled by qa_
