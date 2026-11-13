# Standards: tool/ (the Vercel app)

The TypeScript service in `tool/`. Shared principles, Law of Demeter, Sandi Metz's rules and
git rules are in [README.md](README.md); the behaviour to build is
[../contract/TOOL_CONTRACT.md](../contract/TOOL_CONTRACT.md).

---

## 1. Architecture and layers

Planned layout under `tool/` (its own `package.json`; the Vercel project's root directory),
created as the build proceeds:

```
api/index.ts                      Vercel entry: imports src/main.ts, exports the Express app
config/rules.json                 the one source of market rules (contract section 6)
src/domain/                       pure types and rules, no I/O
  types.ts                        package, finding, report types; ALL_CHECK_IDS and CheckId
  rules.ts  finding.ts            Rules type (shape of rules.json); makeFinding()
  ports/                          LanguageDetector, Clock, Logger
  tokens/                         tokenize, urls, merge-tags, promo-codes, numbers, money,
                                  dates, calendar
  checks/                         compare, numbers, money, dates, merge-tags, urls,
                                  promo-codes, trademarks, markup, length,
                                  template-leftovers, length-ratio, formality, glossary,
                                  untranslated, typography, time-zone, language,
                                  language-text
  copy-fit.ts                     units: chars, ads_chars, sms_segments; artifacts
src/application/                  use cases over ports: check-localization.ts,
                                  locale-checks.ts, check-copy-fit.ts
src/infrastructure/               adapters: eld-detector.ts, console-logger.ts,
                                  system-clock.ts, rules-schema.ts (zod, parses rules.json)
src/presentation/                 opal-tools-sdk registrations: schemas.ts,
                                  localization-check-tool.ts, copy-fit-check-tool.ts,
                                  safe-handler.ts (request -> use case -> response mapping)
src/main.ts                       composition root: createApp(config); loads rules.json, wires
                                  adapters into use cases, registers tools, silences the console
test/                             mirrors src/; test/support/ holds fakes, builders, harnesses
```

Import rules (enforced by lint and the architecture test; section 5):

| Layer | May import |
|---|---|
| `src/domain/**` | `src/domain/**` only. No Node built-ins with I/O, no packages except `zod` types |
| `src/application/**` | domain |
| `src/infrastructure/**` | domain, application (ports and their types only), Node built-ins; `zod` (for `rules-schema.ts`); `eld` (only `eld-detector.ts`) |
| `src/presentation/**` | domain, application, `@optimizely-opal/opal-tools-sdk`, `zod` |
| `src/main.ts` | everything in `src/` and `config/` |
| `api/index.ts` | `src/main.ts` only |
| `test/**` | the layer under test, plus `test/support/**`. Fakes import only domain and ports |

Ports live in `src/domain/ports/`. A port used by exactly one use case may live beside that
use case in `src/application/`.

## 2. TypeScript

- Node 24, ESM (`"type": "module"`), TypeScript ~6.0, `strict: true`,
  `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- No `any`. `unknown` at boundaries is parsed with zod, then narrowed.
- Domain values are plain readonly types. Prefer discriminated unions for statuses
  (`{ status: "verified" } | { status: "unverified"; reason: ... }`).
- **Time:** never call `Date.now()` or `new Date()` outside `SystemClock`. Inject `Clock`.
  Dates are ISO `YYYY-MM-DD` strings in the domain.
- **Randomness:** none is needed. If it ever is, inject it like `Clock`.
- Tool registration uses the SDK's `registerTool(name, { description, inputSchema }, handler)`
  with zod schemas; parameters are inferred from the schema. `new ToolsService(app, config)`
  is created **before** any `registerTool` call. `app.use(express.json())` is added
  explicitly.
- Tool descriptions are written for the calling model: what the function does, when to call
  it, and what comes back.

## 3. Errors, logging and security

- **Statuses, not exceptions,** for every expected problem (contract section 2). Use cases
  return results; adapters (e.g. the language detector answering null when unsure) never
  throw past the port.
- **No diagnostics in responses.** Technical detail goes to the `Logger` port only, as one
  structured line `{ event, tool, status, counts, latency_ms }`, never any request text.
- **Never log or echo** request headers, the bearer token, environment variables or
  campaign copy. A test pins that a response contains no `authorization` text.
- **The SDK itself `console.log`s full request bodies and tool results** (SDK 0.1.41-dev;
  seen in Vercel logs). That would put campaign copy in logs, so the console is silenced in the
  composition root (`src/main.ts`), and a test pins that a tool call writes no request body
  to stdout.
- **Don't use the SDK's error helpers** (`providerError`, `validationError`,
  `resourceNotFound`) for expected problems. They reply HTTP 200 with an error envelope that a
  workflow code step sees as a success. Expected problems are per-item statuses.
- **Auth:** SDK `static_token` mode with `TOOL_BEARER_TOKEN` from the environment. The
  service refuses to start without it.
- **Outbound: none.** The service makes no network requests. No URL from the copy is ever
  fetched; URLs are only compared. A test pins that no code path calls `fetch`.
- **Input:** every parameter is zod-validated with the bounds in the contract.
- **Secrets** live in Vercel environment variables, never in the repo; `.env*` is gitignored.
- **Dependencies:** `pnpm audit` has no high or critical findings at release, or each one is
  explained in the PR.
- A security review against this section runs before every release and before submission.

## 4. Testing

Binding rules; the how-to is the `writing-tests` skill
([../../.claude/skills/writing-tests/SKILL.md](../../.claude/skills/writing-tests/SKILL.md), part 1).

- **Runner:** Vitest. Test files are `test/**/*.test.ts`, mirroring `src/`.
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
  - presentation: requests through the Express app (auth required, validation errors,
    response shape, no diagnostics);
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
pinned (the SDK's peer range, and what was verified with Mark). Known and accepted peer warnings:
the SDK declares `typescript ^5.1.6` and `@types/node ^20`; we use TypeScript 6.0 and
`@types/node` 24 (Node 24), and the typecheck gate covers the SDK's type files.

Gates, each proven by a planted violation that turns it red for its named reason:

| Gate | Command | Catches |
|---|---|---|
| Format | `pnpm format:check` | unformatted code (counted lines assume Prettier output) |
| Lint | `pnpm lint` | Metz limits, `no-restricted-imports` per layer, LoD selector, `no-explicit-any`, `Date.now` outside the clock |
| Waiver directives | `pnpm lint:directives` (`metz-check-directives .`) | waivers without a reason, block disables |
| Typecheck | `pnpm typecheck` | type errors |
| Architecture test | part of `pnpm test` (`test/architecture.test.ts`) | any import that breaks section 1, in every form (`import`, `import type`, `export from`, dynamic `import()`) |
| Duplicates | `pnpm dup` | large copied blocks fail; small ones are reported for review |
| Tests + count | `pnpm test:gate` | failures, zero tests, skips |

All commands run inside `tool/`. The root `scripts/preflight.sh` runs them, and the root
`.githooks/pre-commit` runs format and lint on staged `tool/` files (see
[README.md](README.md) section 5). Gate inputs that require rerunning
`scripts/prove-gates.sh`: lint, format and tsconfig configs, the architecture test, gate
scripts, `tool/package.json`.

## 6. Platform facts (verified 2026-11-12 unless marked)

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
