# launch-readiness-check: operating manual for Claude

A "Launch Readiness Check" built on Optimizely's Agent Platform ("Mark"). A marketer submits
a multi-market campaign brief (chat or email) and gets a per-market verdict and fix list:
- holiday clashes;
- copy that no longer fits after translation;
- local pricing;
- translation and terminology quality;
- tracking links.

Nothing is called "ready" that the system couldn't verify.

Two halves, one repository:
- `tool/`: a TypeScript service on Vercel, registered in Mark as a custom tool. It does the
  deterministic work: live holiday and FX data, price points, character counting,
  rule-based findings, tracking links.
- `mark/`: the Agent Platform side. Two specialized agents (brief interpretation; copy and
  translation review), skills, the workflow, and the Python code steps it runs, generated
  into an importable workflow JSON with a readable canvas layout.

Hard constraints:
- Free, keyless data sources.
- No stored user data.
- Responses carry statuses, never diagnostics.
- A model is used only where language judgment is needed.
- This repository becomes **public**: no secrets, instance ids, webhook URLs or personal
  data, ever.

- What the tool must do (binding): [docs/contract/TOOL_CONTRACT.md](docs/contract/TOOL_CONTRACT.md)
- How we build (binding): [docs/standards/README.md](docs/standards/README.md),
  [TOOL.md](docs/standards/TOOL.md), [MARK.md](docs/standards/MARK.md)
- How we test: [.claude/skills/writing-tests/SKILL.md](.claude/skills/writing-tests/SKILL.md)

---

## The binding rules

A change that violates any of these is rejected, however well it works.

1. **Clean Architecture.** Domain <- application <- infrastructure <- presentation <-
   composition root. Dependencies point inward. Implementation names (`Nager`,
   `Frankfurter`, `Express`) appear only in `tool/src/infrastructure/` and the composition
   root.
2. **SOLID.**
3. **DRY.** The second copy of a value, rule, template or block is the defect. Similar
   patterns are extracted at the third repeat, never before.
4. **Law of Demeter:** talk only to yourself, your parameters, objects you create, and
   values in your own scope. Plain data, config records and collection pipelines are exempt.
   [Exact definition](docs/standards/README.md#2-law-of-demeter).
5. **Interface-first:**
   1. the port;
   2. its fake, plus a contract test;
   3. the use case and its test;
   4. the adapter and its tests.

   In `mark/`, `opal_tms_sdk` is the port, faked in tests.
6. **Sandi Metz's rules:** functions 5 counted lines, files 100, 4 parameters (option keys
   count), waivers next-line with a written reason. TypeScript is gated by
   `eslint-plugin-metz`; Python is enforced by review.
   [Details](docs/standards/README.md#3-sandi-metzs-rules).
7. **Model only where language judgment is needed.** Anything rule-based is code.

**Tests follow these rules exactly as strictly as production code.** Only the size limits
differ: test functions 10, test files 150.

When code disagrees with a standards doc, the doc wins: fix the code, or amend the doc in
the same change. The contract changes only with the owner's approval.

## Required reading by task

| Task | Read first |
|---|---|
| Any change | [standards README](docs/standards/README.md) |
| `tool/` code | [TOOL.md](docs/standards/TOOL.md); the [contract](docs/contract/TOOL_CONTRACT.md) for behaviour |
| `mark/` code steps | [MARK.md](docs/standards/MARK.md) section 2 |
| Agents or skills (Mark) | [MARK.md](docs/standards/MARK.md) section 3 |
| The workflow or its canvas layout | [MARK.md](docs/standards/MARK.md) section 4 |
| Any test, fake, builder or harness | the [writing-tests skill](.claude/skills/writing-tests/SKILL.md) |
| Gates, hooks, lint or format config | [README](docs/standards/README.md) section 5, then [TOOL.md](docs/standards/TOOL.md) section 5 or [MARK.md](docs/standards/MARK.md) section 6 |
| Deploy, registry, security | [TOOL.md](docs/standards/TOOL.md) sections 3 and 6, [MARK.md](docs/standards/MARK.md) section 7 |

## Repository layout

```
CLAUDE.md
docs/contract/TOOL_CONTRACT.md
docs/standards/README.md  TOOL.md  MARK.md
.claude/skills/writing-tests/SKILL.md
```

Planned, created by the scaffold: `tool/`, `mark/`, `scripts/`, `.githooks/` and a
`README.md`; see [standards README section 4](docs/standards/README.md#4-repository-layout).

## Working conventions

### Before claiming anything works
- Run `scripts/preflight.sh` (planned) and read its exit status and the test count from a
  file, not through a pipe.
- A new test is mutated red, then restored by byte-compare.
- A gate change is proven with `scripts/prove-gates.sh`.
- `tool/` is done when the deployed service answers `/discovery` and a real tool call.
- `mark/` is done when the workflow is imported, run end to end in the instance, and the run
  log read: inputs, step outputs, and what chat showed the user. The canvas is checked by
  screenshot.

### Platform facts
- Use the verified facts in [TOOL.md](docs/standards/TOOL.md) section 6 and
  [MARK.md](docs/standards/MARK.md) section 2. Anything new is verified hands-on before it is
  relied on. Read it this session or don't assert it.
- Library APIs: read the installed package's types or official docs, never memory.
- Judge Mark's behaviour by the run log, not by chat text: chat narrates and editorializes.

### Git
- Branch per change; `main` stays releasable. Never push without the owner's approval.
- Stage by name; never `--no-verify`.
- Plain ASCII. No ticket numbers.
- End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Scope
- Build what the contract and standards say. Don't pre-scale or pre-extract.
- Fix review findings in the same change. Never move core scope to later without the owner.
