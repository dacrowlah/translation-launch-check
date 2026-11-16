#!/usr/bin/env bash
# Runs every gate, each one's output to .preflight/<gate>.log; stops at the first failure.
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

# Mark half: Python in mark/ and scripts/, run from the repo venv (python3.12, see
# docs/standards/MARK.md).
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

SKIPPED=0

# A gate whose input does not exist yet is reported as skipped, never as passed.
mark_build() {
  if [ -f "$ROOT/mark/build.py" ]; then
    run_mark mark-build "$VENV/python" "$ROOT/mark/build.py" --example --out "$LOGS/build"
  else
    echo "SKIP mark-build (mark/build.py does not exist)"
    SKIPPED=$((SKIPPED + 1))
  fi
}

run_mark mark-lint "$VENV/ruff" check mark scripts || exit 1
run_mark mark-format "$VENV/ruff" format --check mark scripts || exit 1
run_mark mark-test bash "$ROOT/scripts/mark-test-gate.sh" || exit 1
mark_build || exit 1
echo "mark tests: $(tail -1 "$LOGS/mark-test.log")"
if [ "$SKIPPED" -gt 0 ]; then
  echo "preflight: all gates green ($SKIPPED skipped)"
else
  echo "preflight: all gates green"
fi
