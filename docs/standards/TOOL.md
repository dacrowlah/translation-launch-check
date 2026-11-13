# Standards: tool/ (the Vercel app)

The TypeScript service in `tool/`. Shared principles, Law of Demeter, Sandi Metz's rules and
git rules are in [README.md](README.md); the behaviour to build is
[../contract/TOOL_CONTRACT.md](../contract/TOOL_CONTRACT.md).

---

## 1. Architecture and layers

Planned layout under `tool/` (its own `package.json`; the Vercel project's root directory),
created by the scaffold:

```
api/index.ts                      Vercel entry: imports src/main.ts, exports the Express app
config/rules.json                 policy data (contract section 7)
src/domain/                       pure types and rules, no I/O
  ports/                          HolidayProvider, FxProvider, CoverageProvider, Clock, Cache, Logger
  countries.ts  holidays.ts  pricing.ts  copy-fit.ts  artifacts.ts  tracking.ts  rules.ts
src/application/                  use cases over ports: check-markets.ts, check-copy-fit.ts,
                                  build-tracking-links.ts
src/infrastructure/               adapters: nager-*.ts, frankfurter-fx.ts, http-client.ts
                                  (allow-list, timeout), memory-cache.ts, console-logger.ts,
                                  system-clock.ts
src/presentation/                 opal-tools-sdk registrations: zod schemas, request -> use
                                  case -> response mapping
src/main.ts                       composition root: loads rules.json, wires adapters into use
                                  cases, registers tools
test/                             mirrors src/; test/support/ holds fakes, builders, harnesses
```

Import rules (enforced by lint and the architecture test; section 5):

| Layer | May import |
|---|---|
| `src/domain/**` | `src/domain/**` only. No Node built-ins with I/O, no packages except `zod` types |
| `src/application/**` | domain |
| `src/infrastructure/**` | domain, application (ports and their types only), Node built-ins |
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
  return results; adapters convert upstream failures into `source_unavailable` and never
  throw past the port.
- **No diagnostics in responses.** Upstream codes, timings and messages go to the `Logger`
  port only, as one structured line `{ event, source, market, status, latency_ms }`.
- **Never log or echo** request headers, the bearer token, environment variables or
  campaign copy. A test pins that a response contains no `authorization` text.
- **Auth:** SDK `static_token` mode with `TOOL_BEARER_TOKEN` from the environment. The
  service refuses to start without it.
- **Outbound:** only `api.frankfurter.dev` and `date.nager.at`, enforced in `http-client.ts`,
  with a 5 s timeout. No user-supplied URL is ever fetched (`landing_page_url_template` is
  only formatted, never requested).
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
  `fetch` is replaced by a recording fake through the `http-client` seam, never by global
  monkeypatching.
- **Fake clock** starts at a nonzero epoch, `FAKE_NOW = "2026-11-12"`.
- **Each new test is proven able to fail.** Break the production line it pins, watch it go
  red for the right reason, restore from a scratch copy, then byte-compare.
- A **harness's assertion helpers** have their own tests.
- **Layers to tests:**
  - domain: unit tests, literal tables (rounding, counting, severities);
  - application: use cases over fakes;
  - infrastructure: recording-fake HTTP (URL, query, call count, timeout path, allow-list
    rejection) plus contract tests shared by the fake and the real adapter;
  - presentation: requests through the Express app (auth required, validation errors,
    response shape, no diagnostics);
  - one **live smoke test** against the real APIs. It is opt-in
    (`LIVE=1 pnpm test:live`), never part of the gates.
- **Read the test count** on every run. Zero tests or any unexpected skip is a failure (the
  gate enforces it).

## 5. Tooling and gates (planned; commands verified when the scaffold lands)

- pnpm 11.
- ESLint 10 with `typescript-eslint` 8 and `eslint-plugin-metz` 1.0.0 (`strict`).
- Prettier 3.
- Vitest.
- jscpd for duplicate code.

Pinned versions are recorded in `package.json` at scaffold **(verify at scaffold: ESLint 10 +
typescript-eslint 8 + TypeScript 6 compatibility)**.

Gates, each proven by a planted violation that turns it red for its named reason:

| Gate | Command (planned) | Catches |
|---|---|---|
| Format | `pnpm format:check` | unformatted code (counted lines assume Prettier output) |
| Lint | `pnpm lint` | Metz limits, `no-restricted-imports` per layer, LoD selector, `no-explicit-any`, `Date.now` outside the clock |
| Waiver directives | `pnpm lint:directives` (`metz-check-directives src test api`) | waivers without a reason, block disables |
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
- The tool endpoint path derives from the name: `markets_launch_check` ->
  `/tools/markets-launch-check`.
- After adding or renaming a function, run **Sync** on the registry (Connectors ->
  Registries -> Actions -> Sync). New tools are enabled by default.
- Called from a workflow code step, a tool failure does **not** raise in the caller. It
  comes back as `{ response_type: "error", response: {...} }`, so the HTTP status and body
  shape matter.
- A 100 s tool call from a code step completed normally; the caller's own timeout is the
  limit.
- Vercel entry: `tool/api/index.ts` exporting the Express app, plus `tool/vercel.json` with a
  rewrite of `/(.*)` to `/api`. The Vercel project's root directory is `tool/`.
