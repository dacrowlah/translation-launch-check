# tool/: operating manual for Claude

The TypeScript service on Vercel, registered in Mark as a custom tool. It does the
deterministic work: every rule check (`localization_check`), channel length counting
(`copy_fit_check`) and the language check, all from one rules file. It makes no outbound
requests. The repository's manual is [../CLAUDE.md](../CLAUDE.md); this file adds what is
specific to `tool/` and links to the binding docs rather than repeating them.

## Required reading

1. **Before writing or reviewing any test:** the
   [writing-tests skill](../.claude/skills/writing-tests/SKILL.md), part 1.
2. **Any change:** [TOOL.md](../docs/standards/TOOL.md) and the
   [standards README](../docs/standards/README.md); for behaviour, the
   [contract](../docs/contract/TOOL_CONTRACT.md).
3. **Registration, auth, logging and what a response may carry:** the
   [opal-custom-tools skill](../.claude/skills/opal-custom-tools/SKILL.md).

## Where code goes

Layers and what each may import: [TOOL.md](../docs/standards/TOOL.md) section 1 (enforced by
`pnpm lint` and `test/architecture.test.ts`).

## Gates

Run inside `tool/`:

```
pnpm format:check      # Prettier
pnpm lint              # ESLint: Metz limits, layer imports, Law of Demeter, Date.now, console
pnpm lint:directives   # waivers carry a reason
pnpm typecheck
pnpm dup               # jscpd
pnpm test:gate         # every unit test, with a count check (zero tests or a skip fails)
pnpm test:perf         # scaling tests; they time CPU work, so run them alone
pnpm test <filter>     # a quick run; the filter is a substring, so read the count
```

The repository's `scripts/preflight.sh` runs them all, plus the Mark gates. What each gate
catches, and when to rerun `scripts/prove-gates.sh`: [TOOL.md](../docs/standards/TOOL.md)
section 5.

## Gotchas

- **ASCII only**, in code, tests, fixtures and docs. Non-ASCII test data is written as `\u`
  escapes. A file-writing tool can turn an escape into the literal character without
  saying so, so check every file you touch before staging:
  `LC_ALL=C grep -rn "$(printf '[\200-\377]')" <files>` must print nothing (this form also
  works with the BSD grep of stock macOS, which has no `-P`).
- **The SDK's registry is global.** `registerTool` adds the tool to every `ToolsService`
  that exists when it is called; a service created later gets none of the earlier tools.
  So build one app per process, and in tests one per test file.
  `express.json` is mounted before `new ToolsService`, and the service is created before
  any `registerTool` call (`createApp` in `src/main.ts`).
- **The SDK logs request bodies and results** with `console.log`, which would put campaign
  copy in the logs. `createApp` calls `quietConsole()` once the app is built, which silences
  every console channel, `error` included. Our own log lines go through the `Logger` port
  (`ConsoleLogger` writes one JSON line to stdout), never `console` directly: lint allows
  `console` only in `src/infrastructure/console-logger.ts`.
- **Every tool response is HTTP 200 with a top-level `status` token:** `ok` with the
  result, or `invalid_input`, `internal_error` or `invalid_request` with nothing else (no
  message, validation text, path, input or stack). The exceptions are the SDK's own 401 for a
  missing or wrong bearer token, and 404 `{"status":"not_found"}` for any route other than
  discovery and the two tools. Mark may read a response aloud, so the token is the only
  signal; expected problems with the copy are findings and statuses inside an `ok` response.
- **Relative imports end in `.js`** (`./domain/types.js`). tsconfig is `NodeNext`, and Vercel
  compiles each file on its own, without bundling, for Node's ESM loader, which does not guess
  extensions. Typecheck rejects an extensionless import.
- **The bearer token is the environment variable `TOOL_BEARER_TOKEN`** (at least 32
  characters, no surrounding whitespace, or the app refuses to start). It lives in Vercel's
  environment settings (`.env*` files are gitignored); never in code, tests or docs.
- **`config/rules.json` is the only home for market data**: locales, currencies, date and
  number formats, spelling, glossary, channel limits and every other per-language list.
  `rules-schema.ts` parses it; the Mark side reads its subset of the same file. Never a
  second copy in code.
