# Standards (binding)

How this repository is built. When code and a standards doc disagree, the doc wins: fix the
code, or amend the doc in the same change. Never invent a standard. Items marked
**(planned)** describe files the build has not created yet.

| Doc | Covers |
|---|---|
| this file | principles, Law of Demeter, Sandi Metz's rules, repository layout, gates overview, git |
| [TOOL.md](TOOL.md) | `tool/`: the TypeScript service on Vercel (architecture, TypeScript, errors and security, testing, tooling, platform facts) |
| [MARK.md](MARK.md) | `mark/`: the Agent Platform side (code steps, agents, skills, workflow and canvas layout, testing, tooling, security) |
| [../contract/TOOL_CONTRACT.md](../contract/TOOL_CONTRACT.md) | what the tool must do (binding behaviour) |
| [../contract/BEHAVIOUR.md](../contract/BEHAVIOUR.md) | how the tool's value checks read copy, with examples |
| [../contract/KNOWN_LIMITATIONS.md](../contract/KNOWN_LIMITATIONS.md) | what the tool does not do, and why each gap is accepted |

## 1. Principles (both halves of the repo)

1. **Clean Architecture:** domain <- application <- infrastructure <- presentation <-
   composition root. Dependencies point inward only. No implementation detail in a name
   above the infrastructure layer. Applies fully to `tool/`. In `mark/` it means each code
   step depends only on its input, the helper modules beside it (`mark/code_steps/_*.py`,
   [MARK.md](MARK.md) section 2) and the `tools` facade.
2. **SOLID**, for every module, function, step and test.
3. **DRY.** Never copy an existing value, constant, rule, template or block of code; the
   second copy is the defect. Similar patterns are extracted at the **third** repeat, never
   before. Never pre-extract.
4. **Law of Demeter**, exactly as in section 2.
5. **Interface-first:** port -> in-memory fake (+ contract test if it has behaviour) -> use
   case and its test over fakes -> real adapter and its tests. In `mark/`, the platform's
   `opal_tms_sdk` is the port, faked in tests.
6. **Sandi Metz's rules**, section 3.
7. **Model only where language judgment is needed.** Anything rule-based (input checks,
   facts, severities, scoring, report text, delivery) is code.
8. **Tests follow 1-7 exactly as strictly as production code.** Only the Metz size limits
   differ.

## 2. Law of Demeter

A function may call methods on, and read properties of, only:
- itself (its module's own functions);
- its parameters;
- objects it creates;
- values it holds in its own scope.

It never drives a collaborator's collaborator: `deps.cache.store.get(k)` is a violation. Pass
`cache` itself, or give the collaborator a method that does the job.

Exempt:
- plain value data (DTOs, parsed JSON, config records read by field:
  `rules.limits.email.subject`);
- collection pipelines;
- fluent library APIs designed for chaining (`z.string().describe(...)`).

In `mark/`, a tool result is parsed once into a plain dict at the call site (through
`call_tool` or a platform-tool helper), and never reached through deeper than its
documented shape.

## 3. Sandi Metz's rules

| Limit | Production | Tests |
|---|---|---|
| Counted lines per file (imports excluded) | 100 | 150 |
| Counted lines per function body (signature excluded) | 5 | 10 (`describe` callbacks exempt) |
| Parameters (option-object keys count one each; a named parameter object counts 1) | 4 | 4 |

- **Counted lines:** lines of formatter-output code holding at least one token that is not a
  comment or closing punctuation (`}` `)` `]` `;` `,`). Blank lines never count; Python
  docstrings don't either.
- **TypeScript (`tool/`):** enforced by `eslint-plugin-metz` 1.0.0, preset `strict`, with its
  semantics ([rule docs](https://www.npmjs.com/package/eslint-plugin-metz)).
  - Waivers are next-line only, with a reason of at least 20 letters:
    `// eslint-disable-next-line metz/max-params -- WAIVER: Express handler signature is fixed`.
  - Gated by `metz-check-directives`.
- **Python (`mark/`):** no linter reproduces these semantics.
  - **Review counts them**, on `ruff format` output, by the same definition: a file total
    leaves out imports; a function body leaves out its decorators and its whole signature
    (all lines of a wrapped `def`); module, class and function docstrings, blank lines,
    comments and lines of only closing punctuation never count.
  - A change over a limit states its counted-line total.
  - `ruff` gates parameters (`PLR0913`, `max-args = 4`).
  - Waivers are a `# WAIVER: <reason of at least 20 letters>` comment on the line above.
- Never loosen a number. The fix for too many parameters is a named parameter type or
  dataclass.

## 4. Repository layout

```
README.md            (planned)    what the solution is, how to run and deploy it
CLAUDE.md                         operating manual for Claude; tool/ and mark/ have their own
docs/contract/TOOL_CONTRACT.md    the tool's binding behaviour
docs/contract/BEHAVIOUR.md        how the value checks read copy (rules with examples)
docs/contract/KNOWN_LIMITATIONS.md  accepted gaps, each with its reason
docs/standards/                   this file, TOOL.md, MARK.md
.claude/skills/                   writing-tests (both halves), mark-platform,
                                  mark-code-step-patterns, mark-json-authoring,
                                  opal-custom-tools
demo/                             CSV demo files: template, clean, errors, broken, uk-ch, seeded
                                  errors and its answer key, encodings/ (one campaign, six encodings)
tool/                             the Vercel app (its own package.json; Vercel root directory)
mark/                             code steps and their helpers, agents, skills, _build/
                                  (agent and skill export) and tests; planned: workflow
                                  and build.py
scripts/                          preflight.sh (all gates, both halves), prove-gates.sh,
                                  mark-test-gate.sh, send_package.py (webhook sender, the CMP
                                  stand-in), write_demo_fixtures.py (the tool's demo fixtures
                                  from demo/), catch_rate.py (seeded test set: caught, missed,
                                  extra)
.githooks/                        pre-commit: format and lint on staged files
```

## 5. Gates overview

- `scripts/preflight.sh` runs every gate of both halves and is the authority:
  green before any "done" and before any deploy or import.
- Each gate is proven once by a planted violation that turns it red for its named reason.
  `scripts/prove-gates.sh` replays them in a scratch copy outside the working tree, with a
  no-op control plant; rerun it when a gate input changes.
- The gate lists are in [TOOL.md](TOOL.md) section 5 and [MARK.md](MARK.md) section 6.
- Read the test count on every run. Zero tests or an unexpected skip is a failure. Never
  judge a gate through a pipe.

## 6. Git and change hygiene

- `main` is releasable. Work on a branch; merge when preflight is green.
- Never push without the owner's approval. This repository becomes public at submission,
  so no secrets, webhook URLs, auth keys, instance ids or personal data, ever.
- Stage files by name. Never `--no-verify`. Never rewrite pushed history.
- Plain ASCII in code and docs. Non-ASCII test data is written with escapes where practical.
  No ticket numbers; comments and docs describe current behaviour, not history.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Scope:** build what the contract and standards say. Don't pre-scale or pre-extract. Fix
  review findings in the same change. Moving core scope to later needs the owner.
