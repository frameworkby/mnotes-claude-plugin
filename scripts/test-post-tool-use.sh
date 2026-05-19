#!/usr/bin/env bash
# Smoke test: hooks/scripts/mnotes-post-tool-use.sh tool-family classifier.
# Verifies that every documented tool family (Bash mnotes, Bash decision
# allowlist, Read/Edit/Write) routes to the right kind/ref pair and that
# unrelated tool calls skip logging.
#
# Usage: bash scripts/test-post-tool-use.sh
# Exit code: 0 on pass, 1 on fail.

set -uo pipefail

_HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/scripts/mnotes-post-tool-use.sh"

if [ ! -f "${_HOOK}" ]; then
  printf 'FAIL: hook script not found at %s\n' "${_HOOK}" >&2
  exit 1
fi

_pass=0
_fail=0

_TEST_STATE_DIR="$(mktemp -d)"
trap 'rm -rf "${_TEST_STATE_DIR}"' EXIT

_run_hook() {
  local payload="$1"
  local env_overrides="${2:-}"
  if [ -n "${env_overrides}" ]; then
    HOME="${_TEST_STATE_DIR}" MNOTES_HOOK_DEBUG=1 env ${env_overrides} bash "${_HOOK}" <<< "${payload}"
  else
    HOME="${_TEST_STATE_DIR}" MNOTES_HOOK_DEBUG=1 bash "${_HOOK}" <<< "${payload}"
  fi
}

_last_debug_entry() {
  local log="${_TEST_STATE_DIR}/.claude/plugins/mnotes/state/postusetool.debug.log"
  [ -f "${log}" ] || { printf ''; return; }
  tail -1 "${log}"
}

# JSON payload builders — sid is randomized so each test gets a fresh session.
_payload_bash() {
  printf '{"tool_name":"Bash","tool_input":{"command":"%s"},"tool_response":{"stdout":"ok"},"session_id":"sid-%s"}' "$1" "${RANDOM}-${RANDOM}"
}
_payload_read() {
  printf '{"tool_name":"Read","tool_input":{"file_path":"%s"},"tool_response":{"stdout":""},"session_id":"sid-%s"}' "$1" "${RANDOM}-${RANDOM}"
}
_payload_edit() {
  printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"},"tool_response":{"stdout":""},"session_id":"sid-%s"}' "$1" "${RANDOM}-${RANDOM}"
}
_payload_write() {
  printf '{"tool_name":"Write","tool_input":{"file_path":"%s"},"tool_response":{"stdout":""},"session_id":"sid-%s"}' "$1" "${RANDOM}-${RANDOM}"
}

_assert_kind() {
  local label="$1"
  local payload="$2"
  local expected_kind="$3"
  _run_hook "${payload}" >/dev/null 2>&1
  local entry
  entry=$(_last_debug_entry)
  if printf '%s' "${entry}" | grep -q "kind=${expected_kind}"; then
    printf '  PASS: %s\n' "${label}"
    _pass=$(( _pass + 1 ))
  else
    printf '  FAIL: %s — expected kind=%s, got: %s\n' "${label}" "${expected_kind}" "${entry}" >&2
    _fail=$(( _fail + 1 ))
  fi
}

_assert_ref_contains() {
  local label="$1"
  local payload="$2"
  local needle="$3"
  _run_hook "${payload}" >/dev/null 2>&1
  local entry
  entry=$(_last_debug_entry)
  if printf '%s' "${entry}" | grep -qF "ref=${needle}"; then
    printf '  PASS: %s\n' "${label}"
    _pass=$(( _pass + 1 ))
  else
    printf '  FAIL: %s — expected ref=%s, got: %s\n' "${label}" "${needle}" "${entry}" >&2
    _fail=$(( _fail + 1 ))
  fi
}

_assert_skipped() {
  local label="$1"
  local payload="$2"
  local before
  before=$(_last_debug_entry)
  _run_hook "${payload}" >/dev/null 2>&1
  local after
  after=$(_last_debug_entry)
  if [ "${before}" = "${after}" ]; then
    printf '  PASS: %s\n' "${label}"
    _pass=$(( _pass + 1 ))
  else
    printf '  FAIL: %s — expected no new entry, got: %s\n' "${label}" "${after}" >&2
    _fail=$(( _fail + 1 ))
  fi
}

printf 'PostToolUse hook smoke test\n'

# ── Legacy mnotes Bash families (issue #2, baseline AC) ─────────────────────

_assert_kind 'Bash mnotes: kb recall → query'             "$(_payload_bash 'mnotes kb recall --query test')"             'query'
_assert_kind 'Bash mnotes: bulk knowledge-recall → query' "$(_payload_bash 'mnotes bulk knowledge-recall --query test')"  'query'
_assert_kind 'Bash mnotes: note search → query'           "$(_payload_bash 'mnotes note search --query test')"            'query'
_assert_kind 'Bash mnotes: recall-knowledge → query'      "$(_payload_bash 'mnotes recall-knowledge --query test')"       'query'
_assert_kind 'Bash mnotes: note create → ingest'          "$(_payload_bash "mnotes note create --title 'Foo'")"           'ingest'
_assert_kind 'Bash mnotes: wiki lint → lint'              "$(_payload_bash 'mnotes wiki lint backlinks')"                 'lint'
_assert_skipped 'Bash mnotes: note list is skipped'       "$(_payload_bash 'mnotes note list')"
_assert_skipped 'Bash: non-mnotes random command is silent' "$(_payload_bash 'ls -la')"

# ── Read tool (NEW #13) ──────────────────────────────────────────────────────

_assert_kind 'Read: /tmp/foo.txt → ingest' "$(_payload_read '/tmp/foo.txt')" 'ingest'
_assert_ref_contains 'Read: ref carries file_path' "$(_payload_read '/tmp/uniq-read-ref.txt')" '/tmp/uniq-read-ref.txt'
_assert_skipped 'Read: empty file_path is skipped' "$(_payload_read '')"

# ── Edit/Write tool (NEW #13) ────────────────────────────────────────────────

_assert_kind 'Edit: ordinary path → ingest'             "$(_payload_edit '/tmp/code/foo.ts')"               'ingest'
_assert_kind 'Edit: CLAUDE.md → decision'               "$(_payload_edit '/repo/CLAUDE.md')"                'decision'
_assert_kind 'Edit: .claude/settings.json → decision'   "$(_payload_edit '/repo/.claude/settings.json')"    'decision'
_assert_kind 'Edit: .claude/settings.local.json → decision' "$(_payload_edit '/r/.claude/settings.local.json')" 'decision'
_assert_kind 'Edit: presets/<x>/CLAUDE.md → decision'   "$(_payload_edit '/repo/presets/webapp-nextjs/CLAUDE.md')" 'decision'
_assert_kind 'Write: CLAUDE.md → decision'              "$(_payload_write '/repo/CLAUDE.md')"               'decision'
_assert_kind 'Write: ordinary path → ingest'            "$(_payload_write '/tmp/code/bar.ts')"              'ingest'

# ── Bash decision allowlist (NEW #13) ────────────────────────────────────────

_assert_kind 'Bash: git checkout -b → decision'   "$(_payload_bash 'git checkout -b feat/foo')"          'decision'
_assert_ref_contains 'Bash: git checkout -b ref carries branch name' "$(_payload_bash 'git checkout -b feat/x-unique')" 'feat/x-unique'
_assert_kind 'Bash: git commit → decision'        "$(_payload_bash "git commit -m 'msg'")"               'decision'
_assert_kind 'Bash: gh pr create → decision'      "$(_payload_bash 'gh pr create --title foo')"          'decision'
_assert_kind 'Bash: gh pr merge → decision'       "$(_payload_bash 'gh pr merge 42 --squash')"           'decision'
_assert_kind 'Bash: gh release create → decision' "$(_payload_bash 'gh release create v1.2.3')"          'decision'
_assert_kind 'Bash: npm publish → decision'       "$(_payload_bash 'npm publish --access public')"       'decision'
_assert_kind 'Bash: pnpm publish → decision'      "$(_payload_bash 'pnpm publish')"                      'decision'
_assert_kind 'Bash: yarn publish → decision'      "$(_payload_bash 'yarn publish')"                      'decision'

# Random non-allowlisted Bash must remain silent.
_assert_skipped 'Bash: random ls is silent'       "$(_payload_bash 'ls -la /tmp')"
_assert_skipped 'Bash: random echo is silent'     "$(_payload_bash 'echo hello')"
_assert_skipped 'Bash: git log is silent'         "$(_payload_bash 'git log --oneline -5')"

# ── Env-var configurability (NEW #13 AC) ─────────────────────────────────────

# MNOTES_HOOK_DECISION_ALLOW: extra Bash regex.
_before=$(_last_debug_entry)
HOME="${_TEST_STATE_DIR}" MNOTES_HOOK_DEBUG=1 MNOTES_HOOK_DECISION_ALLOW='^terraform[[:space:]]+apply' \
  bash "${_HOOK}" <<< "$(_payload_bash 'terraform apply -auto-approve')" >/dev/null 2>&1
_after=$(_last_debug_entry)
if [ "${_before}" != "${_after}" ] && printf '%s' "${_after}" | grep -q 'kind=decision'; then
  printf '  PASS: env MNOTES_HOOK_DECISION_ALLOW extends Bash allowlist\n'
  _pass=$(( _pass + 1 ))
else
  printf '  FAIL: env MNOTES_HOOK_DECISION_ALLOW did not extend allowlist (got: %s)\n' "${_after}" >&2
  _fail=$(( _fail + 1 ))
fi

# MNOTES_HOOK_DECISION_PATHS: extra Edit/Write path regex.
_before=$(_last_debug_entry)
HOME="${_TEST_STATE_DIR}" MNOTES_HOOK_DEBUG=1 MNOTES_HOOK_DECISION_PATHS='(^|/)Dockerfile$' \
  bash "${_HOOK}" <<< "$(_payload_edit '/repo/Dockerfile')" >/dev/null 2>&1
_after=$(_last_debug_entry)
if [ "${_before}" != "${_after}" ] && printf '%s' "${_after}" | grep -q 'kind=decision'; then
  printf '  PASS: env MNOTES_HOOK_DECISION_PATHS extends Edit/Write decision list\n'
  _pass=$(( _pass + 1 ))
else
  printf '  FAIL: env MNOTES_HOOK_DECISION_PATHS did not extend list (got: %s)\n' "${_after}" >&2
  _fail=$(( _fail + 1 ))
fi

# ── Session rate cap (existing AC, still holds) ──────────────────────────────
# Fire 50 Read events on unique paths within a single session; expect ≤30 logged.

_RATE_SESSION="sid-ratecap-$RANDOM"
for i in $(seq 1 50); do
  _p=$(printf '{"tool_name":"Read","tool_input":{"file_path":"/tmp/rate-%d.txt"},"tool_response":{"stdout":""},"session_id":"%s"}' "$i" "${_RATE_SESSION}")
  HOME="${_TEST_STATE_DIR}" MNOTES_HOOK_DEBUG=1 bash "${_HOOK}" <<< "${_p}" >/dev/null 2>&1
done
_log="${_TEST_STATE_DIR}/.claude/plugins/mnotes/state/postusetool.debug.log"
_logged=$(grep -c "ref=/tmp/rate-" "${_log}" 2>/dev/null || echo 0)
if [ "${_logged}" -le 30 ] && [ "${_logged}" -ge 1 ]; then
  printf '  PASS: session rate cap holds across 50 Reads (logged %d ≤ 30)\n' "${_logged}"
  _pass=$(( _pass + 1 ))
else
  printf '  FAIL: session rate cap violated — logged %d entries\n' "${_logged}" >&2
  _fail=$(( _fail + 1 ))
fi

# ── Unknown tool type (Glob, Grep, etc.) skips silently ──────────────────────

_assert_skipped 'Unknown tool name (Glob) is skipped' \
  '{"tool_name":"Glob","tool_input":{"pattern":"**/*.ts"},"tool_response":{"stdout":""},"session_id":"sid-x"}'

printf '\nResult: %d passed, %d failed\n' "${_pass}" "${_fail}"

if [ "${_fail}" -gt 0 ]; then
  exit 1
fi
exit 0
