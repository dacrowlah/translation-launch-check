# launch-readiness-check: operating manual for Claude

A "Translation Launch Check" built on Optimizely's Agent Platform ("Mark"). A marketer
attaches a localization file (a CSV string table: master copy plus each translation) in Mark
chat, or sends it by email or webhook, and gets a verdict per language, the findings and
suggested fixes:
- numbers, dates, prices, merge tags, link parameters and promo codes that differ from the
  master;
- copy that no longer fits its channel, or is in the wrong language;
- formality, glossary and market spelling;
- meaning, claims and tone (judged by a model).

Nothing is called "ready" that the system couldn't verify. The report is a screening aid,
never linguistic or legal sign-off.

Two halves, one repository:
- `tool/`: a TypeScript service on Vercel, registered in Mark as a custom tool. It does the
  deterministic work: every rule check (`localization_check`), channel length counting
  (`copy_fit_check`) and the language check, all from one rules file. It makes no outbound
  requests.
- `mark/`: the Agent Platform side. Two specialized agents (Translation Review; Translation
  Fix Suggestions), two skills, the workflow, and the Python code steps it runs, generated
  into an importable workflow JSON with a readable canvas layout. It reuses Optimizely's
  Content Translation agent for the back-translation.

Hard constraints:
- No outbound requests from the tool.
- No stored user data, and no campaign copy in logs.
- Responses carry statuses, never diagnostics.
- A model is used only where language judgment is needed.
- This repository is public: no secrets, instance ids, webhook URLs or personal data,
  ever.

- How we test (read before writing or reviewing any test, in either half):
  [.claude/skills/writing-tests/SKILL.md](.claude/skills/writing-tests/SKILL.md)
- What the tool must do (binding): [docs/contract/TOOL_CONTRACT.md](docs/contract/TOOL_CONTRACT.md);
  how it reads copy: [BEHAVIOUR.md](docs/contract/BEHAVIOUR.md); its accepted gaps:
  [KNOWN_LIMITATIONS.md](docs/contract/KNOWN_LIMITATIONS.md)
- How we build (binding): [docs/standards/README.md](docs/standards/README.md),
  [TOOL.md](docs/standards/TOOL.md), [MARK.md](docs/standards/MARK.md)
- Each half's own manual: [tool/CLAUDE.md](tool/CLAUDE.md), [mark/CLAUDE.md](mark/CLAUDE.md)
- How the platform behaves (verified): [.claude/skills/mark-platform/SKILL.md](.claude/skills/mark-platform/SKILL.md)

---

## The binding rules

A change that violates any of these is rejected, however well it works.

1. **Clean Architecture.** Domain <- application <- infrastructure <- presentation <-
   composition root. Dependencies point inward. Implementation names (`eld`,
   `Express`) appear only in `tool/src/infrastructure/` and the composition
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
| Writing or reviewing any test, fake, builder or harness, in either half | the [writing-tests skill](.claude/skills/writing-tests/SKILL.md): part 1 for `tool/`, part 2 for `mark/` |
| Any change | [standards README](docs/standards/README.md) |
| `tool/` code | [tool/CLAUDE.md](tool/CLAUDE.md); [TOOL.md](docs/standards/TOOL.md); the [contract](docs/contract/TOOL_CONTRACT.md) for behaviour; the [opal-custom-tools skill](.claude/skills/opal-custom-tools/SKILL.md) |
| `mark/` code steps | [mark/CLAUDE.md](mark/CLAUDE.md); [MARK.md](docs/standards/MARK.md) section 2 (Python 3.12); the [mark-code-step-patterns skill](.claude/skills/mark-code-step-patterns/SKILL.md) |
| Agents or skills (Mark) | [MARK.md](docs/standards/MARK.md) section 3; the [mark-json-authoring skill](.claude/skills/mark-json-authoring/SKILL.md) |
| The workflow or its canvas layout | [MARK.md](docs/standards/MARK.md) section 4; the [mark-json-authoring skill](.claude/skills/mark-json-authoring/SKILL.md) |
| Gates, hooks, lint or format config | [README](docs/standards/README.md) section 5, then [TOOL.md](docs/standards/TOOL.md) section 5 or [MARK.md](docs/standards/MARK.md) section 6 |
| Deploy, registry, security | [TOOL.md](docs/standards/TOOL.md) sections 3 and 6, [MARK.md](docs/standards/MARK.md) section 7; the [opal-custom-tools skill](.claude/skills/opal-custom-tools/SKILL.md) |
| Anything about how Mark behaves | the [mark-platform skill](.claude/skills/mark-platform/SKILL.md); unverified claims get a throwaway test first |

## Repository layout

```
README.md    CLAUDE.md    tool/CLAUDE.md    mark/CLAUDE.md
docs/security-review.md  workflow-diagram.png
docs/contract/TOOL_CONTRACT.md  BEHAVIOUR.md  KNOWN_LIMITATIONS.md
docs/standards/README.md  TOOL.md  MARK.md
.claude/skills/writing-tests/SKILL.md
.claude/skills/mark-platform/  mark-code-step-patterns/  mark-json-authoring/  opal-custom-tools/
scripts/     preflight.sh  prove-gates.sh  mark-test-gate.sh  send_package.py  write_demo_fixtures.py  catch_rate.py  ruff.toml
.githooks/   pre-commit
tool/        api/  config/  scripts/  src/{domain,application,infrastructure,presentation}  test/
mark/        code_steps/ (steps and helper modules)  agents/  skills/  workflow/  build.py  _build/  tests/  dist/ (generated)
demo/        template.csv  black-friday-{clean,launch,vendor-export,uk-ch}.csv  seeded-errors.csv (+ .answers.json)  encodings/
```

See [standards README section 4](docs/standards/README.md#4-repository-layout), and
[TOOL.md](docs/standards/TOOL.md) section 1 and [MARK.md](docs/standards/MARK.md) section 1
for the full trees.

## Working conventions

### Before claiming anything works
- Run `scripts/preflight.sh` and read its exit status and the test count from a file, not
  through a pipe.
- A new test is mutated red, then restored by byte-compare.
- A gate change is proven with `scripts/prove-gates.sh`.
- `tool/` is done when the deployed service answers `/discovery` and a real tool call.
- `mark/` is done when the workflow is imported, run end to end in the instance, and the run
  log read: inputs, step outputs, and what chat showed the user. The canvas is checked by
  screenshot.

### Review
- Every change has tests written per the
  [writing-tests skill](.claude/skills/writing-tests/SKILL.md).
- Before it is committed, every change is reviewed for spec compliance and quality, and
  adversarially (trying to break it).

### Platform facts
- Use the verified facts in [TOOL.md](docs/standards/TOOL.md) section 6,
  [MARK.md](docs/standards/MARK.md) section 2 and the
  [mark-platform skill](.claude/skills/mark-platform/SKILL.md). Anything new is verified
  hands-on before it is relied on. Read it this session or don't assert it.
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
