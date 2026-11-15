# Standards: tool/ (the Vercel app)

The TypeScript service in `tool/`. Shared principles, Law of Demeter, Sandi Metz's rules and
git rules are in [README.md](README.md); the behaviour to build is
[../contract/TOOL_CONTRACT.md](../contract/TOOL_CONTRACT.md).

---

## 1. Architecture and layers

Layout under `tool/` (its own `package.json`; the Vercel project's root directory):

```
api/index.ts                      Vercel entry: imports src/main.ts, exports the Express app
config/rules.json                 the one source of market rules (contract section 6)
src/domain/                       pure types and rules, no I/O
  types.ts                        package, finding, report types; ALL_CHECK_IDS and CheckId
  rules.ts  finding.ts            Rules type (shape of rules.json); makeFinding(),
                                  makeUnsureFinding()
  locale-code.ts                  the locale-code pattern (schemas and rules share it)
  copy-fit.ts  sms.ts             units: chars, ads_chars, sms_segments; copy-fit results
  artifacts.ts                    template leftovers (both tools)
  ports/                          LanguageDetector, Clock, Logger, Stopwatch
  tokens/                         tokenize (the stage pipeline) and one module per token
                                  kind and its helpers: links, merge tags, promo codes,
                                  references, dates, times, money, numbers, pair resolution
  checks/                         one module per check (numbers, money, dates, urls,
                                  language, ...) plus compare (the shared diff and result
                                  builders), spans (visible text, protected spans) and words
src/application/                  use cases over ports: check-localization.ts,
                                  locale-checks.ts, locale-report.ts, check-copy-fit.ts
src/infrastructure/               adapters: eld-detector.ts, console-logger.ts (and
                                  quietConsole), system-clock.ts, system-stopwatch.ts;
                                  rules-schema.ts (zod, parses rules.json) with
                                  rules-cross-checks.ts and rules-patterns.ts
src/presentation/                 opal-tools-sdk registrations: tool-definition.ts
                                  (definitions, per-service registration, routes),
                                  schemas.ts, localization-check-tool.ts,
                                  copy-fit-check-tool.ts, safe-handler.ts (validate, run,
                                  status token, one log event)
src/main.ts                       composition root: createApp(config); loads rules.json, wires
                                  adapters into use cases, mounts the route allow-list, body
                                  parser and tools, silences the console
test/                             mirrors src/; test/support/ holds fakes, builders, harnesses
```

Import rules (enforced by lint and the architecture test; section 5):

| Layer                   | May import                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/**`         | `src/domain/**` only. No Node built-ins with I/O, no packages except `zod` types                                                |
| `src/application/**`    | domain                                                                                                                          |
| `src/infrastructure/**` | domain, application (ports and their types only), Node built-ins; `zod` (for `rules-schema.ts`); `eld` (only `eld-detector.ts`) |
| `src/presentation/**`   | domain, application, `@optimizely-opal/opal-tools-sdk`, `zod`                                                                   |
| `src/main.ts`           | everything in `src/` and `config/`                                                                                              |
| `api/index.ts`          | `src/main.ts` only                                                                                                              |
| `test/**`               | the layer under test, plus `test/support/**`. Fakes import only domain and ports                                                |

Ports live in `src/domain/ports/`. A port used by exactly one use case may live beside that
use case in `src/application/`.

## 2. TypeScript

How the SDK registers, validates and logs: the
[opal-custom-tools skill](../../.claude/skills/opal-custom-tools/SKILL.md).

- Node 24, ESM (`"type": "module"`), TypeScript ~6.0, `strict: true`,
  `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- `module` and `moduleResolution` are `NodeNext`, so every relative import names its `.js`
  extension (`./domain/types.js`), and typecheck rejects one without it. Vercel compiles each
  file on its own without bundling, and Node's ESM loader does not guess extensions.
- No `any`. `unknown` at boundaries is parsed with zod, then narrowed.
- Domain values are plain readonly types. Prefer discriminated unions for statuses
  (`{ status: "verified" } | { status: "unverified"; reason: ... }`).
- **Time:** never call `Date.now()` or `new Date()` outside `SystemClock`. Inject `Clock`.
  Dates are ISO `YYYY-MM-DD` strings in the domain.
- **Randomness:** none is needed. If it ever is, inject it like `Clock`.
- Each tool is a `ToolDefinition` (`src/presentation/tool-definition.ts`: name, description,
  zod shape, handler). `src/main.ts` creates `new ToolsService(app, config)` and registers
  each definition on that service only, with `registerOn`, which calls the SDK's public
  instance method `service.registerTool(...)`. The discovery parameters are built from
  `z.toJSONSchema` of the shape, the same way the SDK's global `registerTool` builds them.
  The route allow-list and `express.json({ limit: "256kb" })` are mounted explicitly, before
  the service (section 3).
- Tool descriptions are written for the calling model: what the function does, when to call
  it, and what comes back.

## 3. Errors, logging and security

The SDK's auth, logging and failure behaviour, and the response rule: the
[opal-custom-tools skill](../../.claude/skills/opal-custom-tools/SKILL.md).

- **Statuses, not exceptions,** for every expected problem (contract section 2). Use cases
  return results; adapters (e.g. the language detector answering null when unsure) never
  throw past the port.
- **No diagnostics in responses.** Every tool reply is HTTP 200 with a status token and nothing
  else on failure (contract section 2). Technical detail goes to the `Logger` port only
  (`ConsoleLogger`: one JSON line on stdout), never any request text. Two event kinds:
  - a tool call: `{ event: "tool_call" | "defect", tool, status, latency_ms, lines, locales }`,
    written by `safeHandler`;
  - a request refused before any tool ran (malformed JSON, a body over the limit):
    `{ event: "request_failed", status }`, written by the Express error handler in
    `src/main.ts`, never with the body, the error message or the path.

  A 404 `not_found` and the SDK's 401 write no line. `latency_ms` comes from the injected
  `Stopwatch` port, never from `Date.now()`.

- **Never log or echo** request headers, the bearer token, environment variables or
  campaign copy. A test pins that a response contains no `authorization` text.
- **The SDK itself `console.log`s full request bodies and tool results** (SDK 0.1.41-dev;
  seen in Vercel logs), and `console.error`s a stack with file paths when a handler throws.
  That would put campaign copy in logs, so `createApp` calls `quietConsole()` after the app is
  built, which silences `log`, `info`, `debug`, `warn` and `error`. Tests pin that an invalid
  call and a malformed body each write only our one JSON event line to stdout and nothing to
  stderr (`test/presentation/app-security.test.ts`).
- **Don't use the SDK's error helpers** (`providerError`, `validationError`,
  `resourceNotFound`) for expected problems. They reply HTTP 200 with an error envelope that a
  workflow code step sees as a success. Expected problems are per-item statuses.
- **Never let a handler throw.** The SDK turns a throw into HTTP 500 `{"error": <message>}`.
  `safeHandler` catches every throw from validation or the use case and returns the bare
  `{"status":"internal_error"}`. A logger that throws while recording that failure would
  still escape to the SDK's 500; `ConsoleLogger` only writes one line to stdout.
- **Auth:** SDK `static_token` mode with `TOOL_BEARER_TOKEN` from the environment. The
  service refuses to start without it, or when it is shorter than 32 characters or has
  leading or trailing whitespace.
- **Routes:** an allow-list (`routesOf` in `tool-definition.ts`, built from the same endpoint
  names as registration) runs first, before the body parser and the SDK. Anything else is 404
  `{"status":"not_found"}`, with nothing of the request echoed.
- **Outbound: none.** The service makes no network requests. No URL from the copy is ever
  fetched; URLs are only compared. `src/` has no `fetch`, `http` or `net` call. `domain`,
  `application` and `presentation` may import no Node built-in (presentation only the SDK and
  zod); `infrastructure` may import Node built-ins, and the composition root (`src/main.ts`)
  may import anything (it uses `express`). Lint does not ban the global `fetch`, and no test
  pins its absence, so review checks it.
- **Input:** every parameter is zod-validated with the bounds in the contract, inside the
  tool handler (`safeHandler`), after the SDK's bearer check. The SDK does not validate at
  request time and has no status hook. A malformed call does no work and replies HTTP 200
  `{"status":"invalid_input"}` (no zod text, paths or input); a defect replies
  `{"status":"internal_error"}`; a success replies `{...result, "status":"ok"}`, and a result
  field can never override the status. Our only caller validates first, so a malformed call
  is a caller defect. Never reach the SDK's private router.
- **Body limit:** `express.json({ limit: "256kb" })`, mounted after the route allow-list and
  before the SDK. A 64 KB CSV's package, with JSON escaping, fits; real code-step calls are far
  smaller. A body the parser refuses (over the limit, malformed JSON, a charset that is not a
  UTF encoding: any 4xx from the parser) gets HTTP 200 `{"status":"invalid_request"}`. The
  body is parsed before the SDK's token check, so an unauthenticated malformed body gets
  `invalid_request`, not 401 (by design: one token check, the SDK's).
- **SDK registry:** the SDK's global `registerTool()` registers on every `ToolsService` ever
  created. We never call it (see section 2), so apps built in one process do not share tools.
- **Secrets** live in Vercel environment variables, never in the repo; `.env*` is gitignored.
- **Dependencies:** `pnpm audit` has no high or critical findings at release, or each one is
  explained in the PR.
- A security review against this section runs before every release and before submission.

## 4. Testing

Binding rules; the how-to is the `writing-tests` skill
([../../.claude/skills/writing-tests/SKILL.md](../../.claude/skills/writing-tests/SKILL.md), part 1).

- **Runner:** Vitest. Test files are `test/**/*.{test,spec}.ts`, mirroring `src/`. Two exceptions:
  scaling tests (they time CPU work) live in `test/perf/` and run only in `pnpm test:perf`;
  the regression corpus (every reproduction from a review, one row each) is
  `test/application/regression-corpus.test.ts` over `test/fixtures/regression/*.json`.
- **Search before you create** a fake, builder, harness or test constant
  (`test/support/`).
- **Touch it, fix it:** any test file a change modifies is brought up to these rules in the
  same change.
- **Literal expectations.** Never compute an expected value the way the code does.
- **Fakes over mocks.** In-memory implementations of our own ports live in `test/support/`.
  Mock only third-party pieces that cannot run in tests, with a one-line justification.
  Nothing is monkeypatched globally.
- **Fake clock** starts at a nonzero epoch, `FAKE_NOW = "2026-11-12"`.
- **Each new test is proven able to fail.** Break the production line it pins, watch it go
  red for the right reason, restore from a scratch copy, then byte-compare.
- A **harness's assertion helpers** have their own tests.
- **Layers to tests:**
  - domain: unit tests, literal tables (rounding, counting, severities);
  - application: use cases over fakes;
  - infrastructure: the real adapter against the fake's contract test (`eld-detector`
    against `FakeLanguageDetector`), and `rules-schema` against the shipped `rules.json`;
  - presentation: requests through the Express app (the SDK's 401, the 200 status tokens
    `invalid_input`, `internal_error` and `invalid_request`, 404 `not_found`, response shape,
    no diagnostics);
- **Read the test count** on every run. Zero tests or any unexpected skip is a failure (the
  gate enforces it).

## 5. Tooling and gates (verified at scaffold)

- pnpm 11.
- ESLint 10 with `typescript-eslint` 8 and `eslint-plugin-metz` 1.0.0 (`strict`).
- Prettier 3.
- Vitest.
- jscpd for duplicate code.

Versions are exact in `tool/pnpm-lock.yaml`. Verified together at scaffold: ESLint 10,
typescript-eslint 8, TypeScript 6.0 (typescript-eslint 8 does not support TypeScript 7 yet),
`eslint-plugin-metz` 1.0.0, Prettier 3, Vitest, jscpd. Express 4 and `@types/express` 4 are
pinned to match the SDK's peer range. Known and accepted peer warnings:
the SDK declares `typescript ^5.1.6` and `@types/node ^20`; we use TypeScript 6.0 and
`@types/node` 24 (Node 24). The SDK's types are exercised since Task 12 (presentation imports it) and typecheck cleanly without `skipLibCheck`.

Gates, each proven by a planted violation that turns it red for its named reason:

| Gate              | Command                                            | Catches                                                                                                                               |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Format            | `pnpm format:check`                                | unformatted code (counted lines assume Prettier output)                                                                               |
| Lint              | `pnpm lint`                                        | Metz limits, `no-restricted-imports` per layer, LoD selector, `no-explicit-any`, `Date.now` outside the clock                         |
| Waiver directives | `pnpm lint:directives` (`metz-check-directives .`) | waivers without a reason, block disables                                                                                              |
| Typecheck         | `pnpm typecheck`                                   | type errors                                                                                                                           |
| Architecture test | part of `pnpm test` (`test/architecture.test.ts`)  | any import that breaks section 1, in every form (`import`, `import type`, `export from`, dynamic `import()`)                          |
| Duplicates        | `pnpm dup`                                         | large copied blocks fail; small ones are reported for review                                                                          |
| Tests + count     | `pnpm test:gate`                                   | failures, zero tests, skips; a run over its wall-clock limit (900 s, `scripts/time-limit.mjs`)                                        |
| Scaling tests     | `pnpm test:perf` (`vitest.perf.config.ts`)         | an operation that grows faster than linearly: time(4n) / time(n) of 8 or more; runs alone, one test at a time; wall-clock limit 600 s |

All commands run inside `tool/`. The root `scripts/preflight.sh` runs them, and the root
`.githooks/pre-commit` runs format and lint on staged `tool/` files (see
[README.md](README.md) section 5). Gate inputs that require rerunning
`scripts/prove-gates.sh`: lint, format and tsconfig configs, the architecture test, gate
scripts, `tool/package.json`.

## 6. Platform facts (verified 2026-11-12 unless marked)

What Mark sends, registry sync and what each caller sees: the
[opal-custom-tools skill](../../.claude/skills/opal-custom-tools/SKILL.md).

- The Agent Platform fetches `/discovery` without auth and calls `POST /tools/<name>` with
  `Authorization: Bearer <token>`. The body is `{ parameters, auth_credentials, environment,
... }`, and parameters arrive natively typed.
- The tool endpoint path derives from the name: `localization_check` ->
  `/tools/localization-check`.
- After adding or renaming a function, run **Sync** on the registry (Connectors ->
  Registries -> Actions -> Sync). New tools are enabled by default.
- Called from a workflow code step, a tool failure does **not** raise in the caller. It
  comes back as `{ response_type: "error", response: {...} }`, so the HTTP status and body
  shape matter.
- A 100 s tool call from a code step completed normally; the caller's own timeout is the
  limit.
- Vercel entry: `tool/api/index.ts` exporting the Express app, plus `tool/vercel.json` with a
  rewrite of `/(.*)` to `/api`. The Vercel project's root directory is `tool/`.
- Vercel compiles the TypeScript file by file, without bundling, and runs it as Node ESM, so
  relative imports need their `.js` extension (section 2). The first production deploy, built
  under `Bundler` module resolution with extensionless imports, failed on every request with
  `ERR_MODULE_NOT_FOUND`.
- The bearer token is the Vercel environment variable `TOOL_BEARER_TOKEN`, never in the repo;
  Mark's registry entry for the tool sends the same value as its bearer token.
