# Story #9 — feat(ci): smoke-test every `mnotes <cmd>` reference in skills/agents against the real CLI

**Issue:** [#9](https://github.com/frameworkby/mnotes-claude-plugin/issues/9) · **Milestone:** Sprint 53 · **Size:** M · **Priority:** P1

## Context
Sprint 52 fixed 20+ wrong `mnotes <cmd>` signatures in skills/ and agents/ by manually cross-checking each invocation against `mnotes-cli/src/commands/**/*.ts`. There is no CI gate against this drift recurring. The reference surface lives in two places — `skills/**/*.md` and `agents/**/*.md` — and each restates the CLI surface independently.

Source of truth for "is this command real": `mnotes <cmd> --help` exit code, run against a pinned `mnotes-cli` version.

## Tasks
- [ ] `scripts/check-mnotes-refs.sh`: extract every `mnotes <cmd>` invocation from `skills/**/*.md` and `agents/**/*.md` (markdown code fences + inline backticks + plain mentions).
- [ ] Normalize: strip flags, args, shell substitutions, trailing punctuation; collapse whitespace; keep the command path only (e.g. `mnotes wiki log tail --limit 10` → `mnotes wiki log tail`).
- [ ] Allow-list a small set of false positives if needed (e.g. `mnotes login`, `mnotes <cmd>` placeholder examples).
- [ ] For each unique command path: run `mnotes <path> --help`; collect failures with file:line context.
- [ ] Exit non-zero with a readable summary if any reference fails to parse.
- [ ] `.github/workflows/ci.yml`: run on `pull_request` and `push: main`; install Node 20, `npm i -g mnotes-cli@<pinned>`, run the script.
- [ ] Pin `mnotes-cli` version at the top of `scripts/check-mnotes-refs.sh` (so bumps are deliberate and PR-reviewable).

## Acceptance Criteria
1. Running `scripts/check-mnotes-refs.sh` from a clean checkout against `mnotes-cli@4.1.1` passes — no references fail.
2. Introducing a deliberately-broken reference (e.g. changing `mnotes wiki log tail` to `mnotes wiki log-tail` in `skills/wiki/SKILL.md`) causes the script and the CI workflow to fail with a clear message identifying the file and the broken command.
3. The pinned CLI version is documented in a single, obvious place inside the script.
4. CI workflow runs in under 60 seconds for a normal change set.

## Dev Record
- Branch: _filled by dev_
- PR: _filled by dev_
- Agent calls: _filled by dev_

## QA Review
_filled by qa_
