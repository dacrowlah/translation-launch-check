# launch-readiness-tools: operating manual for Claude

A small TypeScript service, deployed on Vercel, that gives Optimizely's Agent Platform
("Mark") the deterministic half of a multi-market campaign "launch readiness check":
- public holidays and FX rates;
- local price points;
- exact character-limit checks;
- rule-based findings;
- tracking links.

It is registered in Mark as a custom tool registry and called by a workflow's code steps
and one agent. Hard constraints:
- free, keyless data sources only;
- no stored user data;
- every response is statuses, never diagnostics.

- What it must do (binding): [docs/contract/TOOL_CONTRACT.md](docs/contract/TOOL_CONTRACT.md)
- How we build it (binding): [docs/standards/README.md](docs/standards/README.md)
- How we test it: [.claude/skills/writing-tests/SKILL.md](.claude/skills/writing-tests/SKILL.md)

---

## The binding rules

A change that violates any of these is rejected, however well it works.

1. **Clean Architecture.** Domain <- application <- infrastructure <- presentation <-
   composition root (`src/main.ts`). Dependencies point inward only. Implementation names
   (`Nager`, `Frankfurter`, `Express`) appear only in `src/infrastructure/` and the
   composition root.
2. **SOLID.**
3. **DRY.** The second copy of a value, rule or block is the defect. Similar patterns are
   extracted at the third repeat, never before.
4. **Law of Demeter.** Talk only to yourself, your parameters, objects you create, and
   values in your own scope. Never drive a collaborator's collaborator. Plain data, config
   records and collection pipelines are exempt.
   [Exact definition](docs/standards/README.md#3-law-of-demeter).
5. **Interface-first:**
   1. the port in `src/domain/ports/`;
   2. its fake in `test/support/`, plus a contract test;
   3. the use case and its test;
   4. the adapter and its tests.
6. **Sandi Metz's rules** via `eslint-plugin-metz` `strict`: functions 5 counted lines,
   files 100, at most 4 parameters (option keys count), waivers next-line with
   `-- WAIVER: <reason>`.
   [Details](docs/standards/README.md#4-sandi-metzs-rules).

**Tests follow these rules exactly as strictly as production code.** Only the size limits
differ: test functions 10, test files 150.

When code disagrees with a standards doc, the doc wins: fix the code, or amend the doc in
the same change. The contract is changed only with the owner's approval.

## Required reading by task

| Task | Read first |
|---|---|
| Any change | [standards](docs/standards/README.md) sections 1-5 and 10 |
| A tool function's behaviour, parameters or response | [contract](docs/contract/TOOL_CONTRACT.md), then [standards](docs/standards/README.md) section 6 |
| A new port, use case or adapter | [standards](docs/standards/README.md) sections 2 and 7 |
| Any test, fake, builder or harness | the [writing-tests skill](.claude/skills/writing-tests/SKILL.md) and [standards](docs/standards/README.md) section 7 |
| Lint, format, gates, hooks, `package.json` | [standards](docs/standards/README.md) section 8, then run `scripts/prove-gates.sh` (planned) |
| Deploy or registry changes | [standards](docs/standards/README.md) sections 6 and 9 |

## Repository layout

```
CLAUDE.md                          this file
docs/contract/TOOL_CONTRACT.md     what the service does (binding)
docs/standards/README.md           how it is built (binding)
.claude/skills/writing-tests/      test workflow and traps
```

The code layout (`api/`, `config/`, `src/{domain,application,infrastructure,presentation}`,
`test/`, `scripts/`, `.githooks/`) is planned in
[standards section 2](docs/standards/README.md#2-architecture-and-layers) and created by the
scaffold.

## Working conventions

### Before claiming anything works
- Run `scripts/preflight.sh` (planned) and read its exit status and the test count, from a
  file, not through a pipe.
- A new test is not done until it has been mutated red and restored by byte-compare.
- A gate change is not done until `scripts/prove-gates.sh` shows its planted violation going
  red for the right reason.
- After deploying, call `/discovery` and one tool through the real registry (or `curl` with
  the token), and read the response.

### Platform facts
- Don't guess the Agent Platform's or the SDK's behaviour. Use
  [standards section 9](docs/standards/README.md#9-platform-facts-verified-2026-11-12-unless-marked),
  and verify anything new hands-on before relying on it. Read it this session or don't
  assert it.
- Library APIs: read the installed package's types (`node_modules/<pkg>/dist/*.d.ts`) or its
  official docs. Never write from memory.
- Items marked "(verify at scaffold)" are not yet facts.

### Security
- Never log or return request headers, tokens, environment variables or campaign copy.
- Outbound requests go only to the allow-listed hosts. Secrets live only in Vercel env vars.
- Security review against [standards section 6](docs/standards/README.md#6-errors-logging-and-security)
  before every release.

### Git
- Branch per change; `main` stays releasable. Never push without the owner's approval.
- Stage files by name; never `--no-verify`.
- Plain ASCII. No ticket numbers or history in comments.
- End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Scope
- Build what the contract says. Don't pre-scale or pre-extract.
- Fix review findings in the same change.
- Never move core scope to later without the owner.
