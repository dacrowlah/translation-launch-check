#!/usr/bin/env bash
# Runs every gate, each one's output to .preflight/<gate>.log; stops at the first failure.
# Mark gates are added alongside (see docs/standards/MARK.md section 6).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.preflight"
mkdir -p "$LOGS"

# <log name>:<pnpm script inside tool/>
TOOL_GATES=(
  "format:format:check"
  "lint:lint"
  "directives:lint:directives"
  "typecheck:typecheck"
  "dup:dup"
  "test:test:gate"
  "perf:test:perf"
)

run_gate() {
  local name="${1%%:*}" script="${1#*:}"
  if (cd "$ROOT/tool" && pnpm run "$script") >"$LOGS/$name.log" 2>&1; then
    echo "PASS $name"
  else
    echo "FAIL $name (see $LOGS/$name.log)"
    return 1
  fi
}

for gate in "${TOOL_GATES[@]}"; do
  run_gate "$gate" || exit 1
done

# Mark half: Python in mark/, run from the repo venv (python3.12, see docs/standards/MARK.md).
VENV="$ROOT/.venv/bin"

run_mark() {
  local name="$1"
  shift
  if (cd "$ROOT" && "$@") >"$LOGS/$name.log" 2>&1; then
    echo "PASS $name"
  else
    echo "FAIL $name (see $LOGS/$name.log)"
    return 1
  fi
}

mark_build() {
  [ -f "$ROOT/mark/build.py" ] || { echo "mark/build.py not written yet (Task 20)"; return 0; }
  "$VENV/python" "$ROOT/mark/build.py" --example
}

run_mark mark-lint "$VENV/ruff" check mark || exit 1
run_mark mark-format "$VENV/ruff" format --check mark || exit 1
run_mark mark-test bash "$ROOT/scripts/mark-test-gate.sh" || exit 1
run_mark mark-build mark_build || exit 1
echo "mark tests: $(tail -1 "$LOGS/mark-test.log")"
echo "preflight: all gates green"
