---
name: writing-tests
description: Use before writing or changing any test, fake, builder, fixture or harness in this repository (tool/ TypeScript service or mark/ Python code steps and build script), and when reviewing a test diff. Binding rules live in docs/standards/TOOL.md section 4 and docs/standards/MARK.md section 5.
---

# Writing tests

Binding rules: [TOOL.md section 4](../../../docs/standards/TOOL.md) for `tool/`,
[MARK.md section 5](../../../docs/standards/MARK.md) for `mark/`, and the shared principles in
[README.md](../../../docs/standards/README.md) (tests follow them exactly as strictly as
production code). This skill is the workflow, the judgement calls and the traps; every rule
names its fix. Use part 1 for `tool/`, part 2 for `mark/`.

## Part 1: tool/ (TypeScript, Vitest)
### Workflow

1. **Search before you create.**
   - Look in `tool/test/support/` and grep for the domain noun before writing a fake, builder,
     harness or test constant.
   - Reuse or extend what exists. A new shared helper goes in `tool/test/support/`, and gets a
     line in the catalog below.
2. **Touch it, fix it.** A test file you modify meets every rule here by the end of your
   change, including moving it onto a shared fake that already exists.
3. **Interface first:**
   1. the port in `tool/src/domain/ports/`;
   2. its in-memory fake in `tool/test/support/`, with a contract test if the fake has behaviour;
   3. the use case test over fakes, then the use case;
   4. the adapter and its tests.
4. **A test for each layer:**

   | Layer | Test kind | What it pins |
   |---|---|---|
   | domain | unit, table-driven, literal values | rounding, counting, severities, alias resolution |
   | application | use case over fakes | statuses per market, isolation of one market's failure, one FX call for all currencies |
   | infrastructure | recording-fake HTTP + shared contract test | exact URL and query, call count, timeout -> `source_unavailable`, non-allow-listed host refused, cache and stale serving |
   | presentation | requests through the Express app | 401 without the bearer token, zod rejection, response shape, no diagnostics or `authorization` text in the body |
   | live smoke (opt-in) | real Nager.Date and Frankfurter | DE 2027 holidays non-empty; Golden Week period 2027-04-29..2027-05-05 for JP |

5. **Prove each new test can fail.**
   - Copy the production file to a scratch path, break the line the test pins, and watch the
     test fail for the reason its name gives.
   - Restore from the scratch copy and byte-compare (`cmp`).
   - Never restore with `git checkout`, `git stash` or `git reset`: they discard
     uncommitted work, and a green run afterwards looks identical.
   - Confirm the mutation landed on code, not a comment.
6. **Run the gates:** `scripts/preflight.sh` (planned). Read the test count in its output.

### Design rules for tests

- **Fakes over mocks.** Use `FakeHolidayProvider`, `FakeFxProvider`, `FakeCache`,
  `FakeClock`, `RecordingHttp` (planned names) instead of `vi.mock` on our own modules.
  `vi.mock` is allowed only for a third-party module that cannot run in tests, with a
  one-line comment saying why.
- **One behaviour per test**, named for it: `marks_market_unverified_when_holiday_source_times_out`.
- **Expected values are literals:** `expect(suggest(44.22, "EUR")).toBe(44.99)`. Never
  compute the expected value with the code's own formula.
- **Fixtures are builders** with defaults plus overrides (`aBrief({ markets: ["DE"] })`).
  They build the shape production uses today.
- **Discriminating fixtures.**
  - Seed values that must be overwritten.
  - Make every "empty" assertion pair with a test that demands a finding on the same path.
    "No findings for FR" is paired with "a blocker for JP on Showa Day".
- **Fake clock** starts at `FAKE_NOW = "2026-11-12"` (nonzero; a named constant in
  `tool/test/support/clock.ts`).
- **Fakes import only domain and ports**, never infrastructure.
- **Harness assertion helpers are plain exported functions** with their own tests. They pass
  on the right input and fail, with their message, on each wrong input.
- **Same production rule in several places?** Extract the rule, test it once thoroughly, and
  have each consumer assert only that it uses it.

### Running and reading results

- `pnpm test -- <filter>` (inside `tool/`) is a **substring** filter. A filter that matches nothing can still
  exit 0, so read the count.
- **Never pipe a gate into `tail` or `grep` to judge success:** the pipe reports the last
  command's status. Redirect to a file and read the gate's own exit status.
- A skipped test is a failure in `pnpm test:gate`. Never add a skip guard that stays on.
- **Before naming the cause of a failure:** read the exact error, reproduce it, run it
  alone, then read the file's history.

### Fixtures catalog

| Path | Provides | Use when |
|---|---|---|
| (planned) `tool/test/support/clock.ts` | `FAKE_NOW`, `FakeClock` | anything date-dependent |
| (planned) `tool/test/support/http.ts` | `RecordingHttp` (records URL, query, call count; scripted responses, timeouts, errors) | adapter tests |
| (planned) `tool/test/support/providers.ts` | `FakeHolidayProvider`, `FakeFxProvider`, `FakeCoverageProvider` | use case tests |
| (planned) `tool/test/support/builders.ts` | `aCheckRequest`, `aHoliday`, `aRateTable` | any test needing inputs |

Update this table in the same change that adds or renames a support module.

### Checklist before committing

- [ ] Searched `tool/test/support/` before creating a helper.
- [ ] Every test file I touched meets these rules.
- [ ] Tests at each layer I touched; a bug fix has a test that fails on the old code.
- [ ] Each new test was mutated red, restored from a scratch copy, and byte-compared.
- [ ] Expected values are literals; builders produce today's shape.
- [ ] No `vi.mock` of our own modules.
- [ ] Preflight green, with a nonzero test count read from its output (no pipe).

### Known traps

- `fetch` stubbed globally leaks between tests. Fix: inject `HttpClient`; never touch
  `globalThis.fetch` in unit tests.
- Date math across time zones (`new Date("2027-04-29")` is UTC midnight). Fix: keep dates
  as ISO strings in the domain, and compute day differences on parsed UTC dates in one
  helper.
- Floating-point prices (`44.22 * 1.0` style drift). Fix: price math in integer minor units
  inside the domain helper; tests use literal minor-unit and display values.
- CJK width: test both `ads_chars` (CJK = 2) and plain `chars`, with literal strings such as
  `"\u6625\u306e\u30bb\u30fc\u30eb"` (5 CJK characters, 10 ads_chars). Tests may contain non-ASCII test data; code and docs stay ASCII.

## Part 2: mark/ (Python code steps, pytest)
### Workflow

1. **Search before you create.** Check `mark/tests/builders.py` and
   `mark/tests/fakes/opal_tms_sdk/` (planned) before adding a builder or fake behaviour.
   Extend them rather than writing a local copy.
2. **Touch it, fix it.** A test file you modify meets these rules by the end of your change.
3. **Test the real module.**
   - Import the code step module itself (`from mark.code_steps import score`) and call
     `handler(input, ctx)`.
   - Never re-implement a step's logic inside a test.
4. **Script the platform through the fake.**
   - `fake_tools.respond("markets_launch_check", ok({...}))` returns a success;
     `fake_tools.respond(..., error(500))` returns
     `{"response_type": "error", "response": {...}}`, the verified failure shape.
   - Assert on recorded calls: the name, the parameters, and the call count (one batched
     call, not one per market).
5. **Prove each new test can fail.** Break the production line, watch the named failure,
   restore from a scratch copy, then `cmp` it. Never restore with git.
6. **Run** `scripts/preflight.sh` (planned) and read the test count from its output file.

### What to pin, by step

| Step | Must-have tests |
|---|---|
| validate_and_gather (C1) | every required field missing at once -> all listed; past date; duplicate market after alias; tool `response_type: error` -> "not your fault, re-run"; invalid code -> brief rejected with suggestion; checksum present per market; chat runs -> `notify_email` null |
| score (C2) | blocker beats unverified; unverified -> `check_incomplete`; missing review -> `not_checked`; checksum mismatch -> `not_checked`; all green -> `ready`; tracking-link tool error -> status, no raise |
| report (C3) | one template per mode with literal expected text; canvas called with `name`, `content`, `mime_type`; unique canvas name per run; email only to an allow-listed `notify_email`; an address inside the brief is never emailed |
| `_shared` | `call_tool` maps both response shapes; `run_safely` turns an exception into `internal_error` and prints nothing; `facts_checksum` is order-independent for keys |
| build.py | generated JSON has no local imports, no `print(`, every node positioned, no overlaps, code byte-identical to the built source |

### Design rules

- **Builders** (`a_brief`, `a_market_facts`, `a_review`) produce today's shapes: the tool
  contract for facts, and the agent output schema for reviews.
- **Literal expected text** for templates. Copy the exact sentence into the test; never
  rebuild it from the template.
- **Every "clean" assertion has a partner.** "No findings for FR" is paired with "a blocker
  for JP on Showa Day".
- **Silence:** for any step test, use `capsys` to assert that nothing was printed, since chat
  would narrate it.

### Known traps

- A tool error **doesn't raise**. A test that only checks the exception path misses
  `response_type: "error"`. Always test both shapes.
- The `summary` key is stripped before downstream steps see it, so never let later logic
  depend on it.
- An oversized return (over 256 KB) becomes `null` silently. Keep returns small; a test pins
  the size of a 10-market return.
- A pytest filter (`-k`) that matches nothing still exits 0 when other tests run. Read the
  count.
