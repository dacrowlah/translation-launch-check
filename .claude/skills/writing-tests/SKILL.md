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
   | domain | unit, table-driven, literal values | token parsing per locale, each check's findings and severities, length counting, language-text stripping |
   | application | use case over fakes | one finding list per line and locale, `unsupported_locale`, `checks` verified vs not_applicable, master carries only the language checks |
   | infrastructure | adapter + shared contract test | `eld-detector` against the `LanguageDetector` contract; `rules-schema` rejects a bad severity or a missing check id |
   | presentation | requests through the Express app | the SDK's 401 without the bearer token; 200 status tokens: `invalid_input` for a zod rejection (missing locale key in `texts`, over-long cell), `internal_error` for a defect, `invalid_request` for malformed or oversized JSON; 404 `not_found` for any other route; response shape; no diagnostics or `authorization` text, no request body on stdout |

5. **Prove each new test can fail.**
   - Copy the production file to a scratch path, break the line the test pins, and watch the
     test fail for the reason its name gives.
   - Restore from the scratch copy and byte-compare (`cmp`).
   - Never restore with `git checkout`, `git stash` or `git reset`: they discard
     uncommitted work, and a green run afterwards looks identical.
   - Confirm the mutation landed on code, not a comment.
6. **Run the gates:** `scripts/preflight.sh`. Read the test count in its output.

### Design rules for tests

- **Fakes over mocks.** Use `FakeLanguageDetector`, `FakeClock`,
  `RecordingLogger` instead of `vi.mock` on our own modules.
  `vi.mock` is allowed only for a third-party module that cannot run in tests, with a
  one-line comment saying why.
- **One behaviour per test**, named for it: `reports_unsupported_locale_without_findings`.
- **Expected values are literals:** `expect(parseAmount("1.299,00 \u20ac", "de-DE")).toBe(129900)`. Never
  compute the expected value with the code's own formula.
- **Fixtures are builders** with defaults plus overrides (`aPackage({ locales: ["de-DE"] })`).
  They build the shape production uses today.
- **Discriminating fixtures.**
  - Seed values that must be overwritten.
  - Make every "empty" assertion pair with a test that demands a finding on the same path.
    "No findings for de-DE" is paired with "a blocker for the same line when the number
    changes".
- **Fake clock** starts at `FAKE_NOW = "2026-11-12"` (nonzero; a named constant in
  `tool/test/support/clock.ts`).
- **Fakes import only domain and ports**, never infrastructure.
- **Harness assertion helpers are plain exported functions** with their own tests. They pass
  on the right input and fail, with their message, on each wrong input.
- **Same production rule in several places?** Extract the rule, test it once thoroughly, and
  have each consumer assert only that it uses it.

### Running and reading results

- `pnpm test <filter>` (inside `tool/`) is a **substring** filter. Not
  `pnpm test -- <filter>`: pnpm passes the `--` on, and Vitest then ignores the filter and
  runs every file. A filter that matches no file fails (exit 1, "No test files found"); a
  substring can match more files than you meant, so read the count.
- **Never pipe a gate into `tail` or `grep` to judge success:** the pipe reports the last
  command's status. Redirect to a file and read the gate's own exit status.
- A skipped test is a failure in `pnpm test:gate`. Never add a skip guard that stays on.
- `pnpm test:gate` and `pnpm test:perf` run under a wall-clock limit (`scripts/time-limit.mjs`;
  900 s and 600 s, `TEST_GATE_LIMIT_S` / `TEST_PERF_LIMIT_S`): Vitest cannot stop a test that
  hangs in synchronous work, so a hang fails the gate instead of stalling it.
- A test that times work (a scaling test) goes in `tool/test/perf/`. The unit suite leaves
  that folder out; `pnpm test:perf` runs it one test at a time, as its own preflight gate.
- A reproduction from a review becomes a row in `tool/test/fixtures/regression/`, in the
  area and behaviour group it belongs to; a ruled cost goes in a `known_limitation_` group.
  A `..._has_no_finding` group holds only `[]` rows and a `..._finding` group only rows
  with a finding (`corpus.test.ts` checks it). Measure a use-case scaling cell from the
  contract's cell bound up (number-like cells from twice the bound), so fixed per-package work
  does not hide a quadratic stage. A row's copy appears once in the whole corpus.
- **Before naming the cause of a failure:** read the exact error, reproduce it, run it
  alone, then read the file's history.

### Fixtures catalog

| Path | Provides | Use when |
|---|---|---|
| `tool/test/support/rules.ts` | `rawRules()` (parsed real `rules.json`), `testRules()` (one memoized `parseRules(rawRules())` instance, as in production), `testLocale(code)`, `rejection(json)` (what `parseRules` says of a rules JSON: "path: message" per zod issue, the cross-check message, or "accepted") | any test needing rules, or a rules-schema rejection; copy (`{ ...testRules() }`) for a test that needs its own pattern cache |
| `tool/test/support/rows.ts` | `rows(result)`: a check result's findings as `[expected, found]` rows; `numberRows(master, target, locale)`, `dateRows(...)` (dates, numbers and weekday_date_match rows of a pair), `urlRows(...)` (url_params and url_path rows) and `valueRows(...)` (numbers, currency_amount and currency_code rows) | asserting exactly which values a check flagged |
| `tool/test/support/clock.ts` | `FAKE_NOW`, `FakeClock` | anything date-dependent (weekday vs date) |
| `tool/test/support/language-detector.ts` | `FakeLanguageDetector` (scripted answers, including null; an answer outside the candidates is null, as the port promises); `SwitchableDetector` (answers the first candidate, counts `calls`; set `throws` to make a call a defect) | language check tests; defect and no-work tests through the app |
| `tool/test/support/stopwatch.ts` | `FakeStopwatch(ms)` (every call takes exactly `ms`) | asserting `latency_ms` |
| `tool/test/support/telemetry.ts` | `aTelemetry()` (a `RecordingLogger` and a 7 ms `FakeStopwatch`), `aLogEvent({ tool, status, ... })` (the event it records: `tool_call`, 7 ms, no counts unless given) | `safeHandler` tests; asserting log events |
| `tool/test/support/app.ts` | `TOKEN`, `anAppConfig(over)` (`aDeps()` + `TOKEN` + `aTelemetry()`), `startApp(over)` (that app on a free port) | requests through the Express app |
| `tool/test/support/http.ts` | `listen(app)`, `aBody(over)` (a tool-call body), `send(base, { method, path, body?, token })` (a raw request: any method, malformed or oversized JSON), `postTo(base, path, body, token)`, `postText(...)`, `outcome(res)` (`[status, json]`), `discoveryOf(base)` (the discovered functions) | HTTP requests in presentation tests |
| `tool/test/support/console.ts` | `globalConsole()` (the process-wide console) | proving the SDK's console output is silenced |
| `tool/test/support/logger.ts` | `RecordingLogger` | asserting what is logged, and that no copy is |
| `tool/test/support/builders.ts` | `aPackage`, `aLine`, `aPair` (both sides tokenized and resolved, as the use case does), `ctx`, `aDeps(answers)` (the use case's dependencies: real rules, `FakeClock`, scripted `FakeLanguageDetector`), `aDate({ month, day })` (a date token, yearless, no weekday unless given), `tokensOf(locale, text)` (one text, unresolved), `inLocale(extract)(locale, text)` (any extractor in a locale of the real rules), `timesIn(locale, text)` (definite times, candidates, then two-way twelves by default, read as the tokenizer reads it: production's `readable` and `usualTimes`), `linksIn(text)` (links as written), `visibleIn(text)` (`visibleText` under the real rules), `respelled(text, rules?)` (`rewriteVisible` with a fixed word table, so span tests never restate spelling) | any test needing inputs, tokens, a use-case run or span rewriting |
| `tool/test/support/scaling.ts` | `growth(run, n)` (median CPU time of 4n over n, 5 runs each), `LINEAR_GROWTH` (8; linear is about 4, quadratic 16), `SCALING_TIMEOUT` (60 s), `cpuMs(run)` (CPU time of one run) | proving an operation is linear without a wall-clock bound; such tests live in `tool/test/perf/` and run alone in `pnpm test:perf` |
| `tool/test/support/corpus.ts` | `valueFindings(locale, master, target)` (one line through `checkLocalization`: the value checks' findings as `[check, expected, found]`, with `"unsure"` as a fourth value for an unsure finding, plus the line's `spelling_fix`; throws for a locale that is no target locale, so a row never checks nothing), `corpusAreas()` (the rows of `tool/test/fixtures/regression/*.json`; a file with an empty group, or a group or row written twice, throws), `rowKeys(groups)` (each row's locale, master and target), `corpusGroupsOf(text)` (one file's groups) | the regression corpus: every reproduction a review found, one literal row each |

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

- Date math across time zones (`new Date("2026-11-29")` is UTC midnight). Fix: inject
  `Clock`, keep dates as ISO strings in the domain, and compute weekdays on parsed UTC dates
  in one helper.
- Locale number formats: `1.299,00` is 1299 in de and 1.299 in en. Fix: test the same text
  under each locale with literal expected amounts, and keep amounts in integer minor units.
- CJK width: test both `ads_chars` (CJK = 2) and plain `chars`, with literal strings such as
  `"\u6625\u306e\u30bb\u30fc\u30eb"` (5 CJK characters, 10 ads_chars). Tests may contain
  non-ASCII test data, preferably as escapes; code and docs stay ASCII.
- The language detector is statistical. Fix: domain tests use `FakeLanguageDetector`; only
  the adapter's own tests touch `eld`, with long, unambiguous sentences.
- Reordered tokens (merge tags, URLs, dates) are not findings. Pair "no finding when
  reordered" with "a finding when one token changes".

## Part 2: mark/ (Python code steps, pytest)
### Workflow

1. **Search before you create.** Check `mark/tests/builders.py` and
   `mark/tests/fakes/opal_tms_sdk/` before adding a builder or fake behaviour.
   Extend them rather than writing a local copy.
2. **Touch it, fix it.** A test file you modify meets these rules by the end of your change.
3. **Test the real module.**
   - `conftest.py` puts `mark/code_steps/` and the fake on `sys.path`, so a test imports a
     module by its own name (`from _shared import call_tool`; a step as `import score`)
     and calls it (a step through `handler(input, ctx)`).
   - Never re-implement a step's logic inside a test.
4. **Script the platform through the fake** (the `fake_tools` fixture, reset per test).
   - `fake_tools.respond("localization_check", ok({...}))` returns a success;
     `fake_tools.respond(..., error(500))` returns
     `{"response_type": "error", "response": {...}}`, the verified failure shape; an
     exception instance (`ToolUnavailableError("...")`) is raised instead.
   - A call nobody scripted raises `UnscriptedCall`, a `BaseException`, so a misspelt tool
     name fails the test instead of passing as `unavailable`.
   - Assert on recorded calls (`fake_tools.calls`): the name, the parameters, and the call
     count (one batched call for the whole package, not one per locale).
5. **Prove each new test can fail.** Break the production line, watch the named failure,
   restore from a scratch copy, then `cmp` it. Never restore with git.
6. **Run** `bash scripts/mark-test-gate.sh` for the mark tests (it fails on zero tests or
   any skip), and `scripts/preflight.sh` for every gate; read the test count from the
   output.

### What to pin, by step

| Step | Must-have tests |
|---|---|
| read_and_check | CSV saved by Excel (BOM, semicolon, CRLF, quoted multi-line cell) parses; every problem listed at once; near-miss locale gets a suggestion; unknown channel/field pair; duplicate id; empty cell; webhook checksum mismatch -> needs_info; tool `response_type: error` -> "not your fault, re-run"; one `localization_check` call; checksum per locale; chat runs -> `notify_email` null |
| score | blocker beats incomplete beats warning; missing or malformed review (JSON string accepted, prose or fence -> `not_checked`); echoed locale or checksum mismatch -> `check_incomplete`; `unsupported_locale` -> `check_incomplete`; all clean -> `ready` |
| report | one template per mode with literal expected text; "Checked against market rules v..." line; fixes re-checked with one call and marked; canvas called with `name`, `content`, `mime_type`; unique canvas name per run; Markdown table characters escaped; email only to an allow-listed `notify_email`; the email is plain text (exact body); a fix that reads as a note gets its own status in chat, canvas and count, and is never applied |
| needs_info | every problem with its suggestion; link to the template; no canvas |
| helpers: `_shared` (`test_call_tool.py`, `test_run_safely.py`, `test_fake.py`) | `call_tool`: our tool's token passes through, the body only with `ok`; an error envelope, a non-dict result, an SDK exception, a body `status_code` >= 400 or an unknown token is `unavailable`; tool parameters called `name` or `tool` pass. `run_safely`: an exception, `SystemExit` or a result Mark can't return gives the fallback (default: the templated "re-run" needs-info output), printing nothing |
| helpers: `_platform`, `_csv_attachment`, `_address`, `_url` (`test_platform_tools.py`, `test_csv_attachment.py`, `test_allowed_recipient.py`, `test_address.py`, `test_template_url.py`) | `send_email` counts only `sent` and never calls for a recipient off the allow-list or a subject that isn't one line; `create_canvas` needs an `artifact_url`; `read_csv_attachment` checks the shape before any call and tells each failure status apart; address, domain and template URL rules at their length limits |
| helpers: `_checksum` (`test_checksum.py`) | the sender fixture's canonical bytes and SHA-256 reproduced; `facts_checksum` is the first 16 hex, ignores key order and normalizes nothing; `None` (never a raise) for data that isn't plain JSON; `json_size` |
| helpers: `_run_folder` (`test_run_folder.py`, `test_run_binding.py`) | written data reads back with its checksum; a bad run key, file name or data touches nothing; a broken, changed or missing file is `not_checked`; the depth limit never raises or half-writes; `read_verified` and `read_review` fail closed |
| helpers: `_config` (`test_config.py`) | exactly the keys steps use; the private file's resolution order; each wrong shape raises with its exact message, naming no value |
| all helpers (`test_import_graph.py`, `test_inlining.py`) | imports: allow-listed standard library, `opal_tms_sdk` and other helpers only, nothing dynamic, no cycle; each module-level name bound in one helper only (the build inlines them into one namespace) |
| build.py | generated JSON has no local imports, no `print(`, every node positioned, code byte-identical to the built source, each step under its code ceiling, the conditions routing real outputs; `--example` builds without private values; a real build stops without a complete `local.config.json` |

### Design rules

- **Builders** in `mark/tests/builders.py` (e.g. `a_package`, `a_locale_result`, `a_review`)
  produce today's shapes: the tool contract for results, and the agent output schema for
  reviews.
- **Literal expected text** for templates. Copy the exact sentence into the test; never
  rebuild it from the template.
- **Every "clean" assertion has a partner.** "No findings for de-DE" is paired with "a blocker
  for the same line when the number changes".
- **Silence:** for any step test, use `capsys` to assert that nothing was printed, since chat
  would narrate it.

### Known traps

- A tool error **doesn't raise**. A test that only checks the exception path misses
  `response_type: "error"`. Always test both shapes.
- The `summary` key is stripped before downstream steps see it, so never let later logic
  depend on it.
- An oversized return (over 256 KB) becomes `null` silently. Keep returns small; a test pins
  the size of a 5-locale, 50-line return.
- A pytest filter (`-k`) that matches nothing still exits 0 when other tests run. Read the
  count.
