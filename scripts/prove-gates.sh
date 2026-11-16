#!/usr/bin/env bash
# Plants one violation per gate in a scratch copy of tool/ and checks that exactly the named
# gate goes red for its named reason. A no-op control plant must leave every gate green.
# The working tree is never touched: every plant runs in its own copy under mktemp -d.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
FAILED=0

mkdir "$SCRATCH/base"
rsync -a --exclude .vitest.json --exclude .vitest-perf.json "$ROOT/tool/" "$SCRATCH/base/tool/"
# The demo test reads demo/*.answers.json beside tool/.
rsync -a "$ROOT/demo/" "$SCRATCH/base/demo/"

# plant <label> <gate script> <expected output regex> <file> <content> [<file 2> <content 2>]
plant() {
  local label="$1" script="$2" pattern="$3" file="$4" content="$5"
  local dir="$SCRATCH/$label"
  cp -Rc "$SCRATCH/base" "$dir" 2>/dev/null || cp -R "$SCRATCH/base" "$dir"
  mkdir -p "$dir/tool/$(dirname "$file")"
  printf '%s\n' "$content" >"$dir/tool/$file"
  if [ "$#" -ge 7 ]; then
    printf '%s\n' "$7" >"$dir/tool/$6"
  fi
  expect_red "$label" "$script" "$pattern" "$dir"
}

# expect_red <label> <gate script> <expected output regex> <scratch copy>
expect_red() {
  local label="$1" script="$2" pattern="$3" dir="$4"
  (cd "$dir/tool" && pnpm run "$script") >"$dir/out.log" 2>&1
  local status=$?
  # test:gate writes its failures only to the fresh JSON report (never copied into the base).
  local logs=("$dir/out.log" "$dir/tool/.vitest.json")
  if [ "$status" -ne 0 ] && grep -Eqs "$pattern" "${logs[@]}"; then
    echo "OK   $label: gate '$script' is red for '$pattern'"
    echo "       > $({ grep -Ehm1 "$pattern" "${logs[0]}" || grep -Eohm1 "$pattern" "${logs[1]}"; } 2>/dev/null | head -1 | cut -c1-150)"
  else
    echo "FAIL $label: gate '$script' exit $status, pattern '$pattern'; output follows"
    head -30 "$dir/out.log"
    FAILED=1
  fi
}

# edit_plant <label> <gate script> <regex> <file> <text to replace> <replacement> <text to append>
# Edits an existing file of the scratch copy instead of writing a new one.
edit_plant() {
  local label="$1" script="$2" pattern="$3" file="$4"
  local dir="$SCRATCH/$label"
  cp -Rc "$SCRATCH/base" "$dir" 2>/dev/null || cp -R "$SCRATCH/base" "$dir"
  FROM="$5" TO="$6" TAIL="$7" python3 - "$dir/tool/$file" <<'PY'
import os, sys
path = sys.argv[1]
text = open(path).read()
assert text.count(os.environ["FROM"]) == 1, "edit_plant: the text to replace is not there once"
open(path, "w").write(text.replace(os.environ["FROM"], os.environ["TO"]) + os.environ["TAIL"])
PY
  expect_red "$label" "$script" "$pattern" "$dir"
}

control() {
  local dir="$SCRATCH/control" script
  cp -Rc "$SCRATCH/base" "$dir" 2>/dev/null || cp -R "$SCRATCH/base" "$dir"
  mkdir -p "$dir/tool/src/domain"
  printf 'export const noop = 1;\n' >"$dir/tool/src/domain/noop.ts"
  for script in format:check lint lint:directives typecheck dup test:gate test:perf; do
    if ! (cd "$dir/tool" && pnpm run "$script") >"$dir/$script.log" 2>&1; then
      echo "FAIL control: gate '$script' is red on a no-op plant (see $dir/$script.log)"
      FAILED=1
      return
    fi
  done
  echo "OK   control: every gate is green on a no-op plant"
}

# A block of more than 50 tokens, under the function name given.
dup_block() {
  cat <<BLOCK
export function $1(input: number[], factor: number): number[] {
  const scaled = input.map((value) => value * factor + 1);
  const shifted = scaled.map((value) => value - factor * 2);
  const clipped = shifted.filter((value) => value > 0 && value < 1000);
  const doubled = clipped.map((value) => value * 2 + factor);
  return doubled.filter((value) => value % 2 === 0 || value > 10);
}
BLOCK
}

plant metz-function-length lint 'metz/max-counted-lines' src/domain/long.ts \
'export function long(a: number): number {
  const b = a + 1;
  const c = b + 1;
  const d = c + 1;
  const e = d + 1;
  const f = e + 1;
  return f;
}'
plant architecture-layer test 'domain must not import \.\./infrastructure/x' \
  src/domain/a.ts 'import { x } from "../infrastructure/x";
export const a = x;'
plant date-now-in-domain lint 'Date\.now\(\) belongs in' src/domain/now.ts \
  'export const now = (): number => Date.now();'
plant unformatted format:check 'Code style issues found' src/domain/ugly.ts \
  'export const   ugly   =   {a:1,b:2}'
plant duplicate-block dup 'Clone found' src/domain/dup-a.ts "$(dup_block first)" \
  src/domain/dup-b.ts "$(dup_block second)"
# A *.spec.ts file is collected like a *.test.ts one, by the unit gate and by the perf gate.
plant spec-named-test test:gate 'spec file ran.*spec file skipped' test/planted.spec.ts \
  'import { expect, it } from "vitest";
it("planted_spec", () => {
  expect("spec file ran").toBe("spec file skipped");
});'
plant spec-named-perf-test test:perf 'FAIL +test/perf/planted\.spec\.ts' test/perf/planted.spec.ts \
  'import { expect, it } from "vitest";
it("planted_perf_spec", () => {
  expect("spec file ran").toBe("spec file skipped");
});'
plant skipped-test test:gate '1 skipped or todo' test/skipped.test.ts \
  'import { it } from "vitest";
it.skip("skipped", () => {});'
plant quadratic-work test:perf 'to be less than 8' test/perf/quadratic.test.ts \
  'import { expect, it } from "vitest";
import { growth, LINEAR_GROWTH } from "../support/scaling";
let sink = 0;
const quadratic = (n: number) => {
  for (let i = 0; i < n * n; i++) sink += i % 7;
};
it("quadratic", () => {
  expect(growth(quadratic, 2000)).toBeLessThan(LINEAR_GROWTH);
});'
# A quadratic stage in tokenize: a contract-bound package of mixed cells only about 1.1 times
# slower (each text is tokenized once, so the stage runs once per text).
edit_plant quadratic-stage test:perf 'to be less than 8' src/domain/tokens/tokenize.ts \
  'start(text));' 'start(slowly(text)));' '
let sink = 0;
const slowly = (text: string): string => {
  for (let i = 0; i < text.length; i++) for (let j = 0; j < text.length; j += 8) sink += (i ^ j) & 1;
  return sink < 0 ? "" : text;
};'
# A quadratic loop over the numbers found per text (the numbers stage only).
edit_plant quadratic-numbers test:perf 'to be less than 8' src/domain/tokens/numbers.ts \
  'const spaced = items.filter' 'items.forEach((a) => items.forEach((b) => { sink += a === b ? 1 : 0; }));
  const spaced = items.filter' '
let sink = 0;'
# A test that hangs (busy work Vitest cannot interrupt) runs into the gate's wall-clock limit.
# The plant lowers the limit to 20 s and runs only the hanging file, so it is quick.
export TEST_PERF_LIMIT_S=20
plant hanging-test test:perf 'time limit: vitest ran over' test/perf/hang.test.ts \
  'import { it } from "vitest";
it("hangs", () => {
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    // busy
  }
});' vitest.perf.config.ts 'import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/perf/hang.test.ts"], pool: "forks" } });'
unset TEST_PERF_LIMIT_S
plant type-error typecheck 'TS2322' src/domain/bad.ts 'export const x: number = "a";'
plant waiver-without-reason lint:directives 'needs .-- <description>.' \
  src/domain/waiver.ts '// eslint-disable-next-line metz/max-params
export const w = 1;'
control

# ---- The gates' wall-clock wrapper: exit codes pass through and nothing it started survives ----
TL="$ROOT/tool/scripts/time-limit.mjs"
MARK="tlmark$$"
BUSY="node -e \"/*$MARK*/ while (true) {}\""

survivors() {
  sleep 1
  ps -axo command | grep "$MARK" | grep -v grep | grep -vc "BUSY="
}

# expect_run <label> <expected exit> <actual exit>
expect_run() {
  local left
  left="$(survivors)"
  if [ "$3" -eq "$2" ] && [ "$left" -eq 0 ]; then
    echo "OK   time limit, $1: exit $3, no process left"
  else
    echo "FAIL time limit, $1: exit $3 (expected $2), $left process(es) left"
    pkill -f "$MARK"
    FAILED=1
  fi
}

# kill_run <label> <signal> [group]: start a busy run, then signal the wrapper or its group.
kill_run() {
  local pid
  if [ "${3:-}" = group ]; then
    perl -e 'setpgrp; exec @ARGV' sh -c "node $TL 60 sh -c '$BUSY'" &
  else
    node "$TL" 60 sh -c "$BUSY" &
  fi
  pid=$!
  sleep 2
  if [ "${3:-}" = group ]; then kill "-$2" "-$pid"; else kill "-$2" "$pid"; fi
  wait "$pid" 2>/dev/null
  expect_run "$1" "$4" $?
}

node "$TL" 60 node -e "process.exit(0)"; expect_run "the command exits 0" 0 $?
node "$TL" 60 node -e "process.exit(3)"; expect_run "the command exits 3" 3 $?
node "$TL" 2 sh -c "$BUSY" 2>/dev/null; expect_run "the command runs over the limit" 124 $?
node "$TL" 60 sh -c "$BUSY & exit 3"; expect_run "the command exits with a busy child left" 3 $?
kill_run "the wrapper gets SIGHUP" HUP "" 1
kill_run "the wrapper gets SIGQUIT" QUIT "" 1
kill_run "the wrapper is killed" KILL "" 137
kill_run "the caller's group is killed" KILL group 137
node "$TL" 15m node -e "0" 2>/dev/null; expect_run "a limit that is no whole number" 2 $?
node "$TL" 60 no-such-command-tl 2>/dev/null; expect_run "a command that cannot start" 127 $?

# ---- Mark half: plants run in a scratch copy of mark/ plus tool/config/rules.json ----
VENV="$ROOT/.venv/bin"
mkdir -p "$SCRATCH/mbase/tool"
rsync -a --exclude __pycache__ "$ROOT/mark/" "$SCRATCH/mbase/mark/"
rsync -a "$ROOT/tool/config/" "$SCRATCH/mbase/tool/config/"
# The mark tests import scripts/ (send_package, catch_rate) and read demo/ and the tool's
# demo fixtures.
rsync -a --exclude __pycache__ "$ROOT/scripts/" "$SCRATCH/mbase/scripts/"
rsync -a "$ROOT/demo/" "$SCRATCH/mbase/demo/"
rsync -a "$ROOT/tool/test/fixtures/demo/" "$SCRATCH/mbase/tool/test/fixtures/demo/"

# mark_plant <label> <gate: lint|format|test> <expected output regex> <file under mark/> <content>
# (a file under scripts/ is given as ../scripts/<name>)
mark_plant() {
  local label="$1" gate="$2" pattern="$3" file="$4" content="$5"
  local dir="$SCRATCH/m-$label"
  cp -Rc "$SCRATCH/mbase" "$dir" 2>/dev/null || cp -R "$SCRATCH/mbase" "$dir"
  mkdir -p "$dir/mark/$(dirname "$file")"
  printf '%s\n' "$content" >"$dir/mark/$file"
  mark_gate "$dir" "$gate" >"$dir/out.log" 2>&1
  local status=$?
  if [ "$status" -ne 0 ] && grep -Eq "$pattern" "$dir/out.log"; then
    echo "OK   $label: mark gate '$gate' is red for '$pattern'"
    echo "       > $(grep -Em1 "$pattern" "$dir/out.log" | cut -c1-150)"
  else
    echo "FAIL $label: mark gate '$gate' exit $status, pattern '$pattern'; output follows"
    head -30 "$dir/out.log"
    FAILED=1
  fi
}

mark_gate() {
  local dir="$1"
  case "$2" in
    lint) (cd "$dir" && "$VENV/ruff" check mark scripts --no-cache) ;;
    format) (cd "$dir" && "$VENV/ruff" format --check --no-cache mark scripts) ;;
    test) bash "$ROOT/scripts/mark-test-gate.sh" "$dir" ;;
  esac
}

mark_control() {
  local dir="$SCRATCH/m-control" gate
  cp -Rc "$SCRATCH/mbase" "$dir" 2>/dev/null || cp -R "$SCRATCH/mbase" "$dir"
  printf 'NOOP = 1\n' >"$dir/mark/code_steps/_noop.py"
  for gate in lint format test; do
    if ! mark_gate "$dir" "$gate" >"$dir/$gate.log" 2>&1; then
      echo "FAIL mark-control: gate '$gate' is red on a no-op plant (see $dir/$gate.log)"
      FAILED=1
      return
    fi
  done
  echo "OK   mark-control: every mark gate is green on a no-op plant"
}

mark_plant mark-print-in-step lint 'T201' code_steps/printing.py \
  'def handler(input, ctx):
    print("hello")
    return {}'
# The build code too: ruff's default exclude list contains _build (mark/pyproject.toml).
mark_plant mark-print-in-build lint 'T201' _build/printing.py 'print("x")'
mark_plant mark-five-params lint 'PLR0913' code_steps/wide.py \
  'def wide(a, b, c, d, e):
    return a'
mark_plant mark-unformatted format 'would be reformatted' code_steps/ugly.py 'X   =   {"a":1}'
# scripts/ is linted and formatted with mark/'s rules (scripts/ruff.toml extends them).
mark_plant scripts-print lint 'T201' ../scripts/printing.py 'print("x")'
mark_plant scripts-five-params lint 'PLR0913' ../scripts/wide.py \
  'def wide(a, b, c, d, e):
    return a'
mark_plant scripts-unformatted format 'would be reformatted' ../scripts/ugly.py 'X   =   {"a":1}'
mark_plant mark-skipped-test test 'some were skipped' tests/test_skipped.py \
  'import pytest


@pytest.mark.skip(reason="planted")
def test_skipped():
    pass'
mark_control

[ "$FAILED" -eq 0 ] && echo "prove-gates: every plant failed its own gate; control green"
exit "$FAILED"
