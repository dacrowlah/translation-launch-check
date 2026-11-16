# Translation Launch Check

A localization QA check built on Optimizely's Agent Platform ("Mark"). A marketer attaches a
localization file (a CSV string table: the en-US master copy plus each translation) in Mark
chat, or a CMP posts it to a webhook. The workflow returns a verdict per language, the findings
behind it, suggested fixes that were re-checked, and a corrected CSV with those fixes
applied. The verdicts read "Fix first", "Check incomplete - re-run", "No blocking issues
found by automated checks" or "No issues found by automated checks". Screening aid, not
sign-off: a person still reviews every language, and a language the system couldn't fully
check is never reported as passing.

Author: Ryan Crowley.

## Why it matters

Seasonal campaigns launch on the same date in every market, localized from one master. A
local reviewer then compares each translated line with the master by eye. The costly
mistakes are mechanical, and easy to miss in a table of 50 lines and 5 languages:
- a discount that changed (30% in the master, 20% in German);
- a date or weekday that moved;
- a merge tag renamed (`{{first_name}}` became `{{vorname}}`), which the customer then sees;
- a tracking parameter dropped from a link, which breaks attribution;
- a forbidden claim ("garanti") or a promise the master doesn't make (free shipping instead
  of free returns);
- copy too long for its channel, or in the wrong language.

Each one found after launch means a correction email, a price honoured by mistake, or lost
reporting. The check does the line-by-line comparison in a few minutes and points the
reviewer at what still needs a person.

## How it works

![The Translation Launch Check workflow](docs/workflow-diagram.png)

The rule: **code checks values, agents judge language, code decides every verdict.**

- Code reads the file, refuses it with every problem listed if it can't be checked, and runs
  every rule check through one call to the custom tool.
- Per language, Content Translation back-translates to English. Translation Review judges
  what rules can't check (changed claims, meaning drift, tone, literal idioms) and gives a
  second opinion on the rule findings flagged for it. It returns findings, never a verdict.
- Code scores each language. A model never sets a verdict.
- If anything needs fixing, Translation Fix Suggestions drafts a fix per flagged line and
  checks each draft's length with `copy_fit_check`. The report step's code then re-checks
  every draft with `localization_check`; only drafts that pass go into the corrected file.

## Where each component lives

| Component | Name in Mark | Repo path |
|---|---|---|
| Skill (keyword trigger) | Market Rules and Glossary | `mark/skills/market-rules-glossary.template.md` |
| Skill (tool trigger on `copy_fit_check`) | Fix Playbook | `mark/skills/translation-fix-playbook.md` |
| Agent | Translation Review | `mark/agents/translation_review/` |
| Agent | Translation Fix Suggestions | `mark/agents/translation_fix_suggestions/` |
| Agent (reused, Optimizely's) | Content Translation | referenced by the workflow, not in the repo |
| Workflow | Translation Launch Check | `mark/workflow/workflow.json`, code in `mark/code_steps/` |
| Custom tool | `localization_check`, `copy_fit_check` | `tool/`; contract in [docs/contract/TOOL_CONTRACT.md](docs/contract/TOOL_CONTRACT.md) |

**The workflow.** Two triggers: Chat and a Webhook ("Translation Launch Check webhook").
8 top-level steps, with a loop over the languages that holds 3 more:

| Step | Kind | Code |
|---|---|---|
| Read and check the file | code | `read_and_check.py` |
| Is the file usable? | condition | |
| Ask for a corrected file | code | `needs_info.py` |
| For each language: Back-translate to English, Review the translation, Save the review | loop: 2 agents, 1 code step | `save_review.py` |
| Score each language | code | `score.py` |
| Anything to fix? | condition | |
| Suggest fixes | agent | |
| Write and send the report | code | `report.py` |

Each step file imports helper modules (`mark/code_steps/_*.py`); `mark/build.py` inlines them
into the importable workflow JSON.

**Platform tools,** all called by "Write and send the report" through
`mark/code_steps/_platform.py`:

| Tool | Used for |
|---|---|
| `create_canvas` | the report canvas: findings, back-translations, suggested fixes |
| `write_content_to_file` | the corrected CSV, linked from the chat reply |
| `send_email` | the report to the QA inbox, on webhook runs only |

**The custom tool** (`tool/`, TypeScript on Vercel) does all deterministic work from one
rules file, `tool/config/rules.json`:
- `localization_check`: every rule check of each translation against the master (numbers,
  prices, dates, merge tags, links, promo codes, formality, glossary, market spelling,
  forbidden terms) and the language check;
- `copy_fit_check`: channel length counting (characters, double-width characters, SMS
  segments). The fix agent calls it on each draft.

## Repository layout

| Path | What it holds |
|---|---|
| `tool/` | the Vercel service: `src/` (domain, application, infrastructure, presentation), `config/rules.json`, `test/` |
| `mark/` | code steps, agents, skills, the workflow, `build.py` and its `_build/`, tests |
| `demo/` | demo CSV files, the seeded test set and its answer key, `encodings/` |
| `scripts/` | `preflight.sh` (all gates), `prove-gates.sh`, `send_package.py` (webhook sender), `catch_rate.py`, fixture and test helpers; `ruff.toml` (scripts/ uses mark/'s ruff rules) |
| `docs/` | the tool contract, behaviour spec and known limitations; the engineering standards; the security review |
| `.githooks/` | pre-commit: format and lint on staged files |
| `.claude/skills/` | project skills for building and testing with Claude |

## Quick start

```
# The tool: Node 24 and pnpm 11
cd tool && pnpm install && cd ..

# The Mark side: Python 3.12
python3.12 -m venv .venv && .venv/bin/pip install -r mark/requirements-dev.txt

# Every gate of both halves (format, lint, types, architecture, duplicates, tests)
scripts/preflight.sh

# Format and lint staged files on commit
git config core.hooksPath .githooks
```

## Deploy and import

1. Deploy `tool/` to Vercel with `tool/` as the project's root directory, and set the
   environment variable `TOOL_BEARER_TOKEN` (at least 32 characters). The service refuses to
   start without it.
2. Register the tool, write the private config, build and import, following
   [mark/README.md](mark/README.md):
   - section 1, prerequisites: Content Translation active, the tool registry, and
     `mark/local.config.json` (allow-list, QA inbox, template link, webhook trigger name);
   - section 2, build: `.venv/bin/python mark/build.py` writes `mark/dist/`;
   - section 3, import: the two skills, then the workflow, then the webhook's auth key.

## Run it

- **Chat:** attach one localization CSV in Mark chat and send
  `@translation_launch_check check this`.
- **Webhook** (the call a CMP step would make):
  ```
  .venv/bin/python scripts/send_package.py demo/black-friday-errors.csv --dry-run   # prints the payload
  .venv/bin/python scripts/send_package.py demo/black-friday-errors.csv             # prints "HTTP <status>"
  ```

What comes back:

| Output | Chat run | Webhook run |
|---|---|---|
| Chat reply: overall verdict, per-language summary, links | yes | in the run log only |
| Canvas: every finding, back-translations, suggested fixes | yes | yes |
| Corrected CSV (fixes that passed the re-check applied) | when a fix passed | when a fix passed |
| Email to the QA inbox (plain text) | no | yes |

The webhook caller gets only the HTTP status, never the report.

## Demo files and expected verdicts

The walkthrough, with the exact findings of each file, is
[mark/README.md section 5](mark/README.md#5-demo-walkthrough). In short:

| File (`demo/`) | Expected result |
|---|---|
| `black-friday-clean.csv` (de-DE, fr-FR, ja-JP) | No issues found by automated checks, in every language |
| `black-friday-errors.csv` | Fix first: de-DE and fr-FR, 4 blockers and 1 warning each (one blocker in each is a meaning change only Translation Review can see); ja-JP 1 warning |
| `black-friday-broken.csv` | refused, all three problems in one message, no agent runs |
| `black-friday-uk-ch.csv` (en-GB, de-CH) | No blocking issues found by automated checks; market spelling fixed |
| `encodings/` (six encodings of one file) | in chat, UTF-8 and Western Windows-1252 accepted; lost or garbled Japanese refused |
| `seeded-errors.csv` (5 languages) | 20 of 20 planted errors caught: 17 by code, 3 by Translation Review |

A 3-language file takes about 1.5-3 minutes and, from the run logs, about 40-65 credits
(clean 54, errors about 60-64). A refused file costs about 6; the 5-language seeded set
about 92.

## Limits and costs

| Limit | Value | Where |
|---|---|---|
| Rows per file | 50 | `tool/config/rules.json` `limits` |
| Target languages per file | 5 | same |
| Characters per cell | 1,000 | same |
| File size | 64 KB | same |
| Encoding | UTF-8 only | the workflow refuses other encodings |
| Webhook package | about 26.8 KB (26,800 bytes as escaped JSON) | `scripts/send_package.py` refuses larger |
| Markets with rules | en-US master; de-DE, de-CH, fr-FR, en-GB, ja-JP | `tool/config/rules.json` |
| Second opinions | 20 findings per language | Translation Review's output schema |
| Suggested fixes | 60 lines per run | Translation Fix Suggestions' output schema |

Every accepted gap, with its reason: [docs/contract/KNOWN_LIMITATIONS.md](docs/contract/KNOWN_LIMITATIONS.md).

## Security and privacy

Full review: [docs/security-review.md](docs/security-review.md). In short:
- **The tool makes no outbound requests** and stores nothing.
- **No campaign copy in logs.** Responses carry status tokens, never diagnostics.
- **Bearer auth** on every tool call, compared in constant time; `/discovery` is public by
  design, and any other route is a 404.
- **Email goes only to an allow-listed address**, checked in code twice. The recipient comes
  from the private config, never from the file.
- **Untrusted text stays text.** Copy and model output are escaped for Markdown in the chat
  reply and the canvas, and sent as plain text in the email.
- **No formulas in the corrected file.** A suggested fix that would start a spreadsheet
  formula (`=`, `+`, `-`, `@`, a tab or a carriage return first, also after leading
  whitespace or invisible characters) is not applied unless the original cell starts the
  same way.
- **Content Translation can browse the web.** The reused agent has `browse_web`, and
  untrusted copy reaches it. Its answer feeds only the review of one language's lines, and
  every verdict is computed in code.
- **Secrets live only** in the gitignored `mark/local.config.json` and the Vercel
  environment.

## Engineering standards and tests

Both halves follow binding standards ([docs/standards/](docs/standards/README.md)): Clean
Architecture, SOLID, DRY, the Law of Demeter and Sandi Metz's limits (5-line functions,
100-line files, 4 parameters). In `tool/` they are gated by lint, an architecture test and a
duplicate-code check; in `mark/`, ruff gates parameters and review counts lines.
`scripts/preflight.sh` runs every gate, and each gate is proven red by a planted violation
(`scripts/prove-gates.sh`).

Tests at the time of writing:

| Suite | Tests |
|---|---|
| `tool/` unit (Vitest) | 2,062 |
| `tool/` scaling (time grows at most linearly) | 21 |
| `mark/` (pytest) | 1,076 |

## How we'd extend it

Most of these are one more tool call or a rules edit:
- **A customer price list:** check each market's prices against the customer's own list, not
  only against the master.
- **CMP or CMS write-back:** the webhook already takes the JSON package a CMP step would
  post; the corrected lines could be written back the same way.
- **Re-check only changed lines** on a second run.
- **More markets as rules data:** a new locale of a covered language (de-AT) is a
  `rules.json` edit; a new Latin-script language adds its calendar, time and number data
  there, plus one display name in code.

Known gaps today ([KNOWN_LIMITATIONS section 5](docs/contract/KNOWN_LIMITATIONS.md#5-the-workflow-mark-side)):
- **Email intake isn't shipped.** Email can't carry the file yet; an email run is asked to
  attach the file in chat.
- **Webhook failures are silent.** A webhook run that fails sends no email, and the caller
  gets only the HTTP status.
- **Chat runs send no email:** the chat payload carries no verified identity to send to.
