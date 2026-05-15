# Story #3 — fix(skills): correct wiki & snapshot CLI signatures

**Issue:** [#3](https://github.com/frameworkby/mnotes-claude-plugin/issues/3) · **Milestone:** Sprint 52 · **Size:** S · **Priority:** P1

## Context
`skills/wiki/SKILL.md` and `skills/snapshot/SKILL.md` document `mnotes` CLI commands with signatures that don't match the real CLI surface (`mnotes-cli@4.1.0`). Each wrong invocation will fail at runtime with `unknown command` or `unknown option`.

Source of truth: `mnotes-cli/src/commands/wiki/*.ts`, `mnotes-cli/src/commands/kb/{snapshot,consolidate,decay,archive}.ts`.

## Tasks
- [ ] `skills/wiki/SKILL.md`: replace `wiki index-refresh` with `wiki index refresh`
- [ ] `skills/wiki/SKILL.md`: replace `wiki log-append --entry "<msg>"` with `wiki log append --kind <ingest|query|lint|decision> --ref <text> [--summary <text>]`
- [ ] `skills/wiki/SKILL.md`: replace `wiki log-tail` with `wiki log tail`
- [ ] `skills/wiki/SKILL.md`: remove non-existent `wiki lint --fix` and `--scope`; document real `--checks <csv>`, `--limit <n>`, `--include-archived`, `--include-system`, `--notes-only`
- [ ] `skills/snapshot/SKILL.md`: remove `kb snapshot --out <path>`; document `--format json|markdown` and note shell-redirect for files
- [ ] `skills/snapshot/SKILL.md`: replace `kb consolidate --keys "<k1>,<k2>"` with `--note-ids <csv> --target-title <s> --strategy merge|summarize`
- [ ] `skills/snapshot/SKILL.md`: replace `kb decay --threshold-days <n>` with `--threshold <0..1>`, `--limit <n>`, `--decay-window <days>`
- [ ] `skills/snapshot/SKILL.md`: document both `kb archive` modes — key-mode (`--key`/`--keys`) and threshold-mode (`--max-decay-score`, `--max-importance`, `--dry-run`)

## Acceptance Criteria
1. Every documented command in the two files parses against the real CLI when invoked with `--help` (no `unknown command`/`unknown option`).
2. No hyphenated subcommand that should be space-separated (e.g. `index-refresh`) remains.
3. Smoke check: `rg 'index-refresh|log-append|log-tail|--threshold-days|kb snapshot.*--out' skills/` returns zero hits.

## Dev Record
- Branch: _filled by dev_
- PR: _filled by dev_
- Agent calls: _filled by dev_

## QA Review
_filled by qa_
