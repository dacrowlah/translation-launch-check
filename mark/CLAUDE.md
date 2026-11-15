# mark/: operating manual for Claude

The Agent Platform ("Mark") side: the Python code steps, the specialized agents and skills,
and the workflow, built into importable JSON. The repository's manual is
[../CLAUDE.md](../CLAUDE.md); this file adds what is specific to `mark/` and links to the
binding docs rather than repeating them.

## Required reading

1. **Before writing or reviewing any test:** the
   [writing-tests skill](../.claude/skills/writing-tests/SKILL.md), part 2.
2. **Any change:** [MARK.md](../docs/standards/MARK.md) and the
   [standards README](../docs/standards/README.md).
3. **Code steps and their helpers:** MARK.md section 2 and the
   [mark-code-step-patterns skill](../.claude/skills/mark-code-step-patterns/SKILL.md).
4. **Agents, skills, the workflow and its canvas:** MARK.md sections 3 and 4 and the
   [mark-json-authoring skill](../.claude/skills/mark-json-authoring/SKILL.md).
5. **Anything about how Mark behaves:** the
   [mark-platform skill](../.claude/skills/mark-platform/). A claim it doesn't cover is
   verified with a throwaway in the instance before anything relies on it.

## Code-step rules

- **Never print or log.** Mark's chat narrates stdout and stderr to the marketer.
- **Every handler goes through `run_safely`** (`_shared.py`), with a fallback the user can
  read. Steps inside the loop must never fail: one failed iteration stops the workflow.
- **Our tool only through `call_tool(tool, /, **params)`**: any status other than `ok` is a
  failure (`unavailable` when the call itself failed). Platform tools only through the
  helpers in `_platform.py`; email only through `send_email`, which enforces the allow-list.
- **User-facing text only from the templates** (`_text.py`, `_text_problems.py`,
  `_text_report.py`). Never exception text, tool messages or JSON. Untrusted text (copy,
  model output) reaches chat, email and canvas only through `md_text()` (`_markdown.py`).
- Return only routes, the run key, checksums and small plain-JSON values; large data goes
  to the run folder (`_run_folder.py`): `check.json` and `scores.json`, each read back only
  against the checksum the step that wrote it handed on, and `reviews/<locale>.json`, read
  back against its locale's checksum in `check.json` (MARK.md section 1).
- **Steps are `read_and_check.py`, `save_review.py`, `score.py`, `report.py` and
  `needs_info.py`**; the CSV comes from the chat attachment on disk, a webhook package only
  on a run of the configured webhook trigger with a valid checksum, and email can't carry a
  file yet.

## Helpers and the build

- `code_steps/_*.py` are helper modules, never steps. The build (`python mark/build.py
  [--example] [--out DIR]`; MARK.md sections 1 and 2) inlines every `from _x import ...`
  into each step, transitively and each module once, so a step is one file (local imports
  fail in Mark), and replaces `_config` with literal `RULES` and `PRIVATE`. It refuses
  aliased or plain helper imports and any name bound twice.
- Because of that, a helper or step imports only the allow-listed standard library modules
  (no network or process module; `os` only in `_config`, which the build replaces),
  `opal_tms_sdk` and other helpers, and each module-level name is bound in one helper only.
  `test_import_graph.py` and `test_inlining.py` pin both. A new standard-library module is a
  reviewed addition to the allow-list.
- Python 3.12, from the repository's `.venv` (setup below).

## Platform limits (verified unless marked docs)

- A code step's input event is at most **75,776 bytes** as Mark wraps it. Over that, the step
  fails, is retried 3 times, and the run fails before the code starts.
- The step after a loop that takes the loop output gets **each iteration's full record,
  including the loop item**. A code step at the end of the loop body gets only its declared
  inputs. So each iteration ends with *Save the review*, and the step after the loop reads
  the run folder.
- Files under `/workspace` persist between the steps of one run: **large data goes through
  the run folder**, with a checksum, never through step inputs.
- A return over 256 KB silently becomes `null` (docs); `run_safely` refuses a result over
  250,000 bytes.

## Agents and skills

Authored as files under `mark/agents/` and `mark/skills/`. `mark/_build/` holds the
conversion to export-format JSON (agents, skills, and the market rules rendered from
`tool/config/rules.json`); `build.py` (planned) will run it, and the output is imported.
Never typed into the Mark editor: it swallows text after `/`. A change made in the Mark UI is
exported and committed in the same session, or reverted.

## Gates

From the repository root. Set up the venv once:

```
python3.12 -m venv .venv && .venv/bin/pip install -r mark/requirements-dev.txt
```

Then:

```
.venv/bin/ruff check mark
.venv/bin/ruff format --check mark
bash scripts/mark-test-gate.sh     # pytest; zero tests or any skip fails
```

`scripts/preflight.sh` runs these with the `tool/` gates. Details:
[MARK.md](../docs/standards/MARK.md) section 6.
