# Standards: mark/ (the Agent Platform side)

The Optimizely Agent Platform ("Mark") side of the Translation Launch Check: the specialized
agents, skills, workflow and the Python code steps it runs. Shared principles, Law of
Demeter, Sandi Metz's rules and git rules are in [README.md](README.md). Platform behaviour
cited here was verified hands-on in the instance (2026-11); the full record, with a pattern
for each behaviour, is the
[mark-platform skill](../../.claude/skills/mark-platform/SKILL.md).

---

## 1. Layout and the source-of-truth rule

```
mark/                                      the Agent Platform source
  local.config.example.json                placeholders for the private values (section 7)
  requirements-dev.txt  pyproject.toml     pinned pytest and ruff; their settings
  code_steps/read_and_check.py             step "Read and check the file"
  code_steps/save_review.py                step "Save the review" (last step of each loop)
  code_steps/score.py                      step "Score each language"
  code_steps/report.py                     step "Write and send the report"
  code_steps/needs_info.py                 step "Ask for a corrected file"
  code_steps/_shared.py                    call_tool, call_platform, run_safely
  code_steps/_routes.py                    route tokens; has_route_word, defused (stdlib only)
  code_steps/_platform.py                  platform-tool helpers: send_email (allow-list),
                                           create_canvas, write_file, read_csv_attachment
  code_steps/_address.py                   email address and allow-list rules
  code_steps/_url.py                       the template URL rule
  code_steps/_checksum.py                  canonical JSON, sha256_hex, facts_checksum,
                                           locale_checksum, json_size
  code_steps/_run_folder.py                run-folder files: write, read, bind to a checksum
  code_steps/_config.py                    RULES and PRIVATE (files in dev, literals after build)
  code_steps/_campaign.py                  the campaign name, cleaned (canvas name, subject)
  code_steps/_package.py  _locales.py      validate_package(): rules shared by CSV and webhook
                                           (per cell: empty, NUL, "????", garbled, too long)
  code_steps/_csv_package.py               parse_csv() -> package; strip_bom
  code_steps/_webhook_package.py           from_webhook() -> package (checksum)
  code_steps/_tool_report.py               the tool's report: shape check, flat findings
  code_steps/_check_facts.py               check.json: lines, rule findings, refs, checksums
  code_steps/_loop_items.py                loop items: review and back-translation inputs
  code_steps/_finding_text.py              "28 of 30 ads_chars", " Expected: ... Found: ..."
  code_steps/_budgets.py                   code ceilings and code-step input budgets
  code_steps/_review.py                    Translation Review's answer: parsed and bound
  code_steps/_model_output.py              JSON as object or text; model text, shortened
  code_steps/_agent_output.py              an agent's answer, even inside its execution record
  code_steps/_markdown.py                  md_text(): untrusted text shown as text
  code_steps/_verdict.py                   verdict_for, overall (code decides every verdict)
  code_steps/_scoring.py                   one language's score
  code_steps/_fixable.py                   which findings a fix addresses; prices never
  code_steps/_fix_input.py                 lines to fix and the fixer's input text
  code_steps/_fixes.py                     suggested fixes and their one re-check call
  code_steps/_report_view.py  _message.py  the chat reply (also the QA-inbox email)
  code_steps/_corrected_file.py            the corrected CSV: passing fixes applied, no prices
  code_steps/_canvas.py                    the canvas markdown
  code_steps/_text.py  _text_problems.py  _text_report.py   every user-facing template
  agents/<agent_id>/                       agent.json, prompt.md, output.schema.json
                                           (translation_review, translation_fix_suggestions)
  skills/market-rules-glossary.template.md the rubric; its <!-- RULES --> marker is rendered
                                           from tool/config/rules.json at build
  skills/translation-fix-playbook.md       skill text + When-to-use
  _build/agents.py  skills.py              agent and skill sources -> export-format JSON
  _build/market_rules.py                   the market rules part of the skill, from rules.json
  tests/                                   conftest.py, builders.py, step_builders.py,
                                           report_support.py, fakes/opal_tms_sdk/,
                                           test_*.py (section 5)
```

The agents, skills, workflow and build:
```
mark/
  README.md                                setup, import, running and the demo walkthrough
  workflow/workflow.json                   steps, triggers, conditions, canvas positions
                                           (code steps by code_file; section 4)
  build.py                                 python mark/build.py [--example] [--out DIR]
  _build/inline.py  names.py               a step and its helpers as one file; name clashes
  _build/workflow.py                       the importable workflow; our agents bundled
  dist/                                    generated, importable, gitignored (never hand-edited)
```

**Run folder files** (`/workspace/tlc/<run_key>/`), each `{data, checksum}`, one handoff
checksum per hop:
- `check.json`, written by *Read and check the file* and handed on as `run_key` +
  `check_checksum`. It holds everything Score needs: campaign, source, `notify_email`,
  `rules_version`, the master lines, and per locale its status, lines, rule findings (those
  that need a second opinion carry an `R<n>` ref, at most 20 per locale with unsure
  findings first, the rest `ref: null`), the count of findings that needed a second opinion
  but weren't sent (`unsent_checks`), checks and locale checksum;
- `reviews/<locale>.json`, written by *Save the review*: `{locale, checksum, review,
  back_translation}`. Score binds it to that locale's checksum in the verified `check.json`
  (the loop item carries the same value);
- `scores.json`, written by *Score each language* and handed on as `run_key` +
  `verdict_checksum`: campaign, source, `notify_email` and `rules_version` copied forward,
  the outcome, each locale's score, the lines to fix, the count left unfixed
  (`unfixed_lines`) and the run's total of findings not sent for a second opinion
  (`unsent_checks`). The report reads only this file and says what was left out. When a
  fix passes the re-check, the report also writes the corrected file from it: the same
  columns and rows with each passing fix applied (never to a line with a price or currency
  finding, nor a fix that still holds a problem's found value or has its expected value
  more often than the master: a correction note such as "X, not Y"), UTF-8 with a BOM, CRLF, through `write_content_to_file`, and links its download.

**Source of truth: the repo, not the instance.**
- Every agent, skill and code step is edited here, then built and imported. Mark exports the
  same format back, so a round trip is verifiable.
- A change made in the Mark UI is exported and committed in the same session, or reverted.
- `mark/dist/` is generated and gitignored; never edit it.

## 2. Python code steps

How to write a step, with a complete runnable example: the
[mark-code-step-patterns skill](../../.claude/skills/mark-code-step-patterns/SKILL.md).

The platform contract (verified; the evidence and more facts are in the
[mark-platform skill](../../.claude/skills/mark-platform/SKILL.md)):
- **Signature:** `def handler(input: dict, ctx: dict) -> dict`.
  - `input` holds the step's declared variables;
  - `ctx["output_dir"]` and `ctx["input_dir"]` hold the step's directories; a chat
    attachment is at `ctx["input_dir"]/attachments/<name>`, byte-exact.
- **Runtime:** **Python 3.12** (3.12.3, verified 2026-11-13; local venv `.venv` from
  `python3.12`, ruff `target-version = "py312"`), standard library plus the preinstalled
  `opal_tms_sdk`. **No network.** One file after the build; local imports are impossible.
  JavaScript code steps cannot call tools (verified 2026-11-13), so steps are Python.
- **Platform tools:** `from opal_tms_sdk import tools`, then `tools.<name>(**params)`.
- **The observed failures came back as data.** A tool failure came back as
  `{"response_type": "error", "response": {...}}`, and a success as
  `{"response_type": "<mime>", "response": <body>}`. One 500 also came back as a
  success-typed response with `status_code: 500` in the body. The SDK also defines exception
  classes, so a call can raise too.
- **Limits:**
  - a code step's input event is at most 75,776 bytes as Mark wraps it; over that, the step
    fails, is retried 3 times, and the run fails before the code starts. **The step's own
    code counts toward that cap** (2026-11, tiny input: 68,200 and 70,700 bytes of code ran;
    73,200 and more failed with exit_code=-1 and no message). Rule: the JSON-escaped built
    code plus the escaped input (`json_size`) stays at most 68,000, about 5 KB under the cap.
    `_budgets.py` holds each step's code ceiling (escaped: read and check 41,000, save the
    review 10,000, score 24,000, report 43,000, ask for a corrected file 20,000; none above
    `MAX_CODE_BYTES`, 60,000) and `input_budget(step)` = 68,000 - ceiling. The caps derive from the budgets: the back-translation cap is Save the
    review's budget less the largest review the agent schema admits; the fixer cap keeps
    the lines' expected fixes (each bounded by the fixer schema) within the report step's
    budget; problems leave the read step at most 25 (plus a count), each field at most 300
    characters; second-opinion refs stop at the review schema's 20 per locale, and fixer
    lines at the fix schema's 60. The webhook sender refuses a package over Read and check
    the file's budget less its keys (26,800 bytes of escaped JSON);
  - a return is at most 256 KB, and a bigger one silently becomes `null` (docs);
  - the timeout is set per step: default 30 s, at most 300 s (docs).
- **Loops:** the step after a loop that takes the loop output receives each iteration's full
  record, including the whole loop item, so it can break the input limit. A code step at the
  end of the loop body receives only its declared inputs.
- **Files under `/workspace` persist between the steps of one run.** Large data goes there
  (the run folder, below), never through step inputs.
- **The `summary` key** of the return value appears in logs and is stripped before
  downstream steps see the output.
- **Copy never comes from chat's `text_content`:** that field is model-written. The CSV is
  read from the attachment; a webhook package is verified by its checksum.

Rules:
- **Every tool call goes through a helper.**
  - Our own tool: `call_tool(tool, /, **params)` in `_shared.py` returns
    `{"ok", "status", "body"}`. `status` is the tool's own token (`ok`, `invalid_input`,
    `internal_error`, `invalid_request`), or `unavailable` for an error envelope, a non-dict
    result, any exception from the SDK, a body `status_code` of 400 or more (an int, a float
    or a numeric string), or a missing or unknown token. `ok` is `status == "ok"`, and the
    body is passed on only then. The tool name is positional-only, so a tool parameter
    called `name` still works.
  - Platform tools: `call_platform(tool, /, **params)` returns the body dict, or `None` for
    the same failure shapes. The helpers in `_platform.py` then check that tool's own
    fields: `send_email` counts only `status == "sent"`, `create_canvas` needs an
    `artifact_url`, `write_file` needs `file_metadata.download_link` (not under `data`), and
    `read_csv_attachment` returns a status with the text.
  - Never branch on an error's own keys: they differ between tools.
- **Never raise for expected problems.** Return a status or a route.
  - Each step's handler calls `run_safely(impl, input_, ctx, fallback=None)` from
    `_shared.py`. An exception (including `SystemExit`), or a result that is not a dict of
    plain JSON within 250,000 bytes as measured by `json_size`, gives `fallback`. The
    default fallback is the needs-info route (`tlc_route_needs_info`) with the templated
    "re-run" message.
  - Only three places catch broadly, on purpose: `run_safely`; the SDK call inside
    `call_tool` and `call_platform` (an exception is a failure); and the helpers in
    `_checksum.py`, which return `None` for anything they can't encode or compare, even a
    value whose own comparison raises.
- **Never print.** Mark's chat narrates stdout and stderr to the marketer (tested). No
  `print`, no `logging` to stderr.
- **Steps inside the loop must never fail:** one failed iteration stops the whole workflow
  (tested).
- **Return only what downstream needs, as a plain-JSON dict, plus a one-line user-safe
  `summary`.** No diagnostics. Technical detail stays in the tool's own server log.
- **User-facing text comes only from the templates** in `_text.py`, `_text_problems.py` and
  `_text_report.py`. Each template is pure string formatting; the report and canvas code
  never write prose.
- **Untrusted text is shown as text.** Copy, the campaign name, the tool's details and the
  agents' drafts, reasons and notes reach the chat reply, the email and the canvas only
  through `md_text()` (`_markdown.py`; `safe()` and `cell()` build on it). It escapes
  Markdown and HTML syntax (links, images, emphasis, headings, tables, tags), removes control
  and format characters (bidi overrides, zero-width characters), and defuses the route
  prefix. Every echo of user or model text into a step output goes through `defused()`
  (`_routes.py`), so no copy or model text can form a route token.
- **The parse chain runs outside Mark.** `_csv_package`, `_webhook_package` and `_checksum`,
  and every helper they import, use the standard library only: no `opal_tms_sdk`, no
  `_config`. `scripts/send_package.py` (the webhook sender) imports `_csv_package` and
  `_checksum` on a laptop. `test_parse_chain.py` loads the three in a fresh interpreter with
  neither the SDK nor any config.
- **Checksums** (`_checksum.py`):
  - canonical JSON is exactly what `json.dumps(sort_keys=True, separators=(",", ":"),
    ensure_ascii=False, allow_nan=False)` writes, encoded as UTF-8. Data that is not plain
    JSON (a lone surrogate, NaN or infinity, a non-string key, a tuple or set, nesting too
    deep) has no canonical form: every helper returns `None` for it, so it never verifies;
  - the webhook's `package_sha256` is `sha256_hex`: the full 64-hex SHA-256 of the canonical
    JSON of every other field;
  - handoffs between steps use `facts_checksum`, the first 16 hex of that digest.
    `locale_checksum` covers the locale code together with its lines and rule findings, so
    two locales with identical text get different values;
  - the reading step recomputes with the same helper. A mismatch makes that locale
    `check_incomplete` ("re-run").
- **Large data goes through the run folder** (`_run_folder.py`): `/workspace/tlc/<run_key>/`
  with a random 16-hex `run_key`, holding `{data, checksum}` files.
  - The run key and file name reach steps through the model, so both are validated.
    `write_run_file` returns `ok`, `invalid_path`, `invalid_data` (data that would not read
    back unchanged) or `unavailable` (storage failed); `invalid_path` and `invalid_data`
    touch nothing.
  - `read_run_file` always checks the file's own checksum. `read_verified` and `read_review`
    then bind the file to a value an earlier step handed over, failing closed.
  - Every read returns a fresh `{status, data, checksum}` dict with status `ok`,
    `not_checked` or `invalid_path`. Test `status`: stored data may itself be null.
  - Step outputs carry only routes, the run key and checksums.
- **Email goes only to allow-listed recipients, enforced in code:** `send_email` in
  `_platform.py` refuses, without calling the tool, any recipient `allowed_recipient`
  rejects, and any subject with a control, format or line-break character. The allow-list is
  in the private config (section 7). A recipient passes only as a valid bare address that is
  listed exactly, or whose domain is exactly a listed domain (case-insensitive; no
  subdomains). Never only in a prompt.

**Build-time inlining** (`build.py`, `_build/inline.py`):
- A module whose name starts with `_` is never a step.
- The build inlines every helper a step imports with `from _x import a, b` (one line or a
  parenthesized multi-line import), transitively, each module once, dependencies first, so
  the step is one self-contained file.
- It refuses what would make the built step differ from the tested sources: `import _x`, an
  aliased or star import of a helper, a helper import inside a function, a relative import,
  `from __future__`, and a module-level name bound in two of the inlined modules
  (`_build/names.py`, the same walker `test_inlining.py` and `test_step_names.py` use).
- It shrinks the built code without changing it: docstrings, comments and blank lines go
  (an AST round trip; helper imports are dropped from the tree, never by line), indents
  become one space, non-ASCII is escaped, and the result must parse to the same tree.
- It also relies on lint rules the gate enforces: E402 (imports at the top, so moving them
  can't reorder side effects) and A001/A004 (no helper shadows a builtin, which would change
  it for every inlined module).
- `build.py` refuses a built step whose JSON-escaped code is over its ceiling
  (`CODE_CEILINGS`, never above `MAX_CODE_BYTES`, 60,000), so the input budgets hold for the
  code that ships. It also refuses a webhook trigger whose name differs from the private
  `webhook_trigger_name`, when the config names one.
- A real build reads exactly `mark/local.config.json`, never the example and never
  `TLC_CONFIG`; a missing or incomplete file stops it (exit 2) with a message naming no
  value. `--example` uses `local.config.example.json`.
- `_config` is special: the build replaces it with literal `RULES = {...}` and
  `PRIVATE = {...}`. In dev and tests the module reads files:
  - `RULES`: the keys of `tool/config/rules.json` the steps use (`limits`, `master_locale`,
    `locales`, `locale_aliases`, `channels`, and `severities`, whose keys are the check ids);
  - `PRIVATE`: `allow_list`, `qa_inbox`, `template_url` and `webhook_trigger_name` (None
    when absent) from the file named by `TLC_CONFIG`, else `mark/local.config.json`, else
    the example file. Script-only values (the webhook section) never reach a step;
  - the values are checked at import (section 7). A missing key or a wrong shape raises, with
    a message that names no value.
- User-facing templates live in `_text.py`, `_text_problems.py` and `_text_report.py`,
  inlined like any other module.
- **Tests pin what inlining relies on:**
  - the import graph (`test_import_graph.py`): a helper or step imports only allow-listed
    standard library modules (`csv`, `datetime`, `hashlib`, `io`, `json`, `pathlib`, `re`,
    `secrets`, `unicodedata`; `os` only in `_config`, which the build replaces),
    `opal_tms_sdk` and helpers. So no step can import a network module (`socket`, `http`,
    `urllib`, `ssl`), nor a process module (`subprocess`; and `os` once the build replaces
    `_config`, which is the one module allowed it). It imports nothing dynamically
    (`__import__`, `exec`, `eval`, `compile`, `importlib`, ...), and the helpers form no
    import cycle. A new standard-library module is a reviewed one-line addition to the
    allow-list;
  - duplicate names (`test_inlining.py`): each module-level name is bound in one helper only,
    because inlining puts every helper into one namespace; and (`test_step_names.py`) no step
    binds a name a helper it inlines also binds;
  - the prompts' contract (`test_prompt_contract.py`): the review input's double-check items
    and the fix input, built from each merged prompt example's facts, appear in that prompt
    verbatim.

Tests import the real modules, so the shipped code and the tested code are the same source.

## 3. Agents and skills

The authoring format, export fields and import steps: the
[mark-json-authoring skill](../../.claude/skills/mark-json-authoring/SKILL.md).

- **Agents are authored as files** under `mark/agents/<agent_id>/` (`agent.json`,
  `prompt.md`, `output.schema.json`) and assembled by `build.py` into export-format JSON
  (`schema_version` `1.3`), then imported with "Reuse existing". Never type a prompt into the
  Mark editor: it swallows text after `/`.
- **Names and ids** follow Optimizely's own convention: Title Case display name that says the
  job, id in snake_case. No prefix codes.

  | Kind | Name (id) |
  |---|---|
  | Workflow | Translation Launch Check (`translation_launch_check`) |
  | Agents | Translation Review (`translation_review`), Translation Fix Suggestions (`translation_fix_suggestions`) |
  | Skills | Market Rules and Glossary (`market-rules-glossary`), Fix Playbook (`translation-fix-playbook`) |
  | Tool registry | Translation Launch Check Tools |
  | Tools | `localization_check`, `copy_fit_check` |

  The prebuilt Content Translation agent (`translation`) is reused for the back-translation;
  it must be installed and Active (set up in `mark/README.md`).
- **Agent answers that feed a code step are bounded in their output schemas** (`maxItems`,
  `maxLength`), and `_budgets.py` holds the same bounds (`REVIEW_BOUNDS`, `FIX_BOUNDS`;
  `test_budgets.py` pins them equal), because the platform fails a code step whose input is
  too large before any code runs. Translation Review: at most 20 findings (detail 240
  characters, evidence 120) and 20 `rule_checks` (reason 200). Translation Fix Suggestions:
  at most 60 fixes (suggested text 1,000 characters, note 240). Whether Mark enforces
  `maxItems` and `maxLength` (it enforced keys and enums) is not verified yet; an instance
  test checks it.
- **Every agent:**
  - has one job;
  - has a strict JSON output schema;
  - has `is_enabled_in_chat: false` unless it is meant to be used directly;
  - has the minimum tool list (Translation Review: none; Translation Fix Suggestions:
    `copy_fit_check` only);
  - has no `ask_user_question` (workflow steps run single-turn).
- **Prompts are self-contained.** They state the job, the inputs by `[[name]]`, the rules,
  the output contract, and what never to do (no verdicts, no invented values, no repeating
  rule-based checks).
- **Skill references in prompts:**
  - pin a specific skill with `` {skill: `shortcut`} `` (backticks required);
  - auto-select by tool with `{skill: **auto-tool**}`;
  - a plain `{skill: words}` is a search query, not a pin.
- **Skills are written as unconditional guidance** (rules, rubrics, glossaries), never as
  "if this applies, do X": a model may decide it doesn't apply. Organization skills only,
  each with a shortcut. The Market Rules and Glossary skill text is rendered from
  `tool/config/rules.json` plus the judgment rubric, so the rules are never copied by hand.
  The Fix Playbook's When-to-use is the tool `copy_fit_check`.

## 4. Workflow and canvas layout

The workflow's export format, loops, conditions, triggers and canvas layout: the
[mark-json-authoring skill](../../.claude/skills/mark-json-authoring/SKILL.md).

- **The workflow is generated** by `mark/build.py` into `mark/dist/`, in export format
  (`step_type`, `parameters_schema`, `child_steps`, `target_step_id`), then imported.
- **Step names** on the canvas are plain, exactly these eleven:

  | Step | Kind |
  |---|---|
  | Read and check the file | Code |
  | Is the file usable? | Condition |
  | Ask for a corrected file | Code |
  | For each language | Loop |
  | Back-translate to English | Agent step (Content Translation) |
  | Review the translation | Agent step (Translation Review) |
  | Save the review | Code |
  | Score each language | Code |
  | Anything to fix? | Condition |
  | Suggest fixes | Agent step (Translation Fix Suggestions) |
  | Write and send the report | Code |

- **Conditions** match against the previous step's output text, so a code step emits an exact
  routing token with the reserved prefix `tlc_route_` (`tlc_route_needs_info`,
  `tlc_route_fix`), and the condition uses a whole-token `regex` on it
  (`\btlc_route_fix\b`). A condition always follows a code step, never an agent or the loop.
  The first step rejects copy that contains the reserved prefix.
- **Branch join:** both branches of *Anything to fix?* end at *Write and send the report*.
  Two incoming paths into one step import and run (verified).
- **Data passing:**
  - Automatic inputs are filled by the orchestrator model, so every variable has a precise
    `description`;
  - a Fixed input on an agent step inside a loop is dropped, so constants are pinned in an
    Automatic input's description;
  - loop `items_source` names the upstream field (verified to pass by reference);
  - the step after the loop takes no loop output (section 2). Each iteration ends with
    *Save the review*, which receives only small declared inputs (`run_key`, the loop
    item's `locale` and `checksum`, and the two agents' answers), never the whole loop item,
    and writes them to the run folder. *Score each language* reads them back with
    `read_review`, which accepts a review only if it names its locale and echoes that
    locale's checksum;
  - facts handed across steps carry a checksum (section 2).
- **Pretty canvas: owner requirement.** `agent_metadata.nodes` in `mark/workflow/workflow.json`
  gives every node an explicit position, hard-coded by this recipe. There is no separate
  layout file and no overlap test; `test_build.py` checks that every node has a position and
  that loop children are placed relative to their loop:
  - **Main flow** runs top to bottom in one column at `x = 0`, 220 px between rows.
  - **Branches** go to the side: a second column at `x = 440`, so nothing comes closer
    than 80 px to the loop container (320 px wide).
  - **Loop containers** are sized to fit their children with 40 px padding. Children are
    laid out inside on the same grid.
  - Edges never cross nodes. No two nodes overlap, and no node is closer than 80 px to
    another.
  - Every node has the short, human name from the table above.
  - **Verify visually** after each import: a screenshot of the canvas is checked (kept
    with the submission materials, outside this repo).
- **Triggers:** Chat and Webhook (the Email source is deferred). `auth_key` is null in the
  source and the platform makes the URL on import. **The import dialog has no auth-key
  field**, so after import: open the workflow editor, click the webhook trigger node, set
  **Auth Key** under AUTHENTICATION and click **Update** (verified: the key persists across a
  reload). The URL is shown in the same panel. Mark then expects the raw key in the header
  `X-Api-Key` (format `{token}`), whatever the imported JSON names; a POST with no key, a
  wrong key, or the key in `Authorization` (raw or `Bearer`) gets 401
  `{"detail":"Invalid or missing authentication key"}`. Setup steps: `mark/README.md`
  section 3. Webhook URLs and auth keys are never committed.
- **The loop's `max_iterations`** comes from `RULES["limits"]["max_targets"]` at build, the
  same cap "Read and check the file" enforces, so the two can't drift.

## 5. Testing

The how-to is the [writing-tests skill](../../.claude/skills/writing-tests/SKILL.md), part 2.

- **Runner:** pytest. Tests live in `mark/tests/`: one `test_*.py` per helper concern
  (`test_call_tool.py`, `test_run_folder.py`, `test_config.py`, ...). Each code step and the
  build get their own test file as they are written.
- **`conftest.py`** puts the fake and `mark/code_steps/` on `sys.path`, so tests import a
  module by its own name (`from _shared import call_tool`), and points `TLC_CONFIG` at the
  example config, never a developer's real one.
- **`opal_tms_sdk` is replaced by an in-memory fake** in `mark/tests/fakes/opal_tms_sdk/`
  (the `fake_tools` fixture). It records calls and returns scripted
  `{"response_type", "response"}` values, including error responses, or raises a scripted
  exception instance. An unscripted call raises `UnscriptedCall`, a `BaseException`, so a
  misspelt tool name fails the test. It is never a `monkeypatch` of our own modules.
- **Fixtures are builders** in `mark/tests/builders.py` (platform shapes),
  `step_builders.py` (the CSV, package, tool report, agents' answers and runs of the real
  steps) and `report_support.py`, with defaults plus overrides,
  producing the exact shapes the tool contract and the platform produce today.
- **Literal expectations.** Each new test is proven able to fail: mutate the production line,
  watch it go red, restore from a scratch copy, byte-compare.
- **Helper structure is pinned:** the import graph and duplicate names (section 2).
- **The build is pinned** by `test_inline.py` (order, each helper once, multi-line imports,
  `_config` literals, every refused form), `test_build.py` (the eleven step names, routing
  on the whole route tokens after code steps, the loop cap, triggers without secrets, every
  node positioned, loop children relative, code byte-identical to `inline()`, each step's
  inputs equal to what its code or agent reads, our agents bundled) and
  `test_built_steps.py` (the CLI, valid Python with a handler, no local imports, no print,
  only allow-listed imports, the example config injected, no real private value in a
  tracked file, and the five built steps run end to end on the fake SDK).
- **End-to-end runs in the instance are the integration test.** Each demo case
  (`mark/README.md` section 5) is run, and the outcome checked in the run log, not only in
  chat text. The budget is about 10 end-to-end runs. Measured credits per run: about 6 for a
  refused file, 40-65 for a 3-language file, and about 92 for the 5-language seeded set
  (`mark/README.md` section 6).

## 6. Tooling and gates

All commands run from the repository root, with the root `.venv` (Python 3.12), set up
once with `python3.12 -m venv .venv && .venv/bin/pip install -r mark/requirements-dev.txt`.

- `ruff check mark` and `ruff format --check mark`. ruff is pinned in
  `requirements-dev.txt`; `mark/pyproject.toml` selects `E`, `F`, `W`, `I`, `B`, `S`
  (bandit subset), `T10` (no debugger), `T20` (no print), `A` and `PLR0913` with
  `max-args = 4`, line length 100, target Python 3.12.
- `bash scripts/mark-test-gate.sh`: pytest over `mark/`, green only when at least one test
  passed and none was skipped, deselected or xfailed.
- `python mark/build.py --example`: builds from `local.config.example.json` into a new temp
  directory, so the build is proven without private values. The tests above pin the
  generated output. `mark/dist/` is not committed, so there is nothing to diff.
- `mark/pyproject.toml` sets ruff's `exclude` to ruff 0.17.5's default list minus `_build`:
  the default silently skipped `mark/_build/`. A prove-gates plant (a `print` in
  `mark/_build/`) keeps it so.
- `scripts/preflight.sh` runs all of the above after the `tool/` gates.
  `.githooks/pre-commit` runs `ruff check` and `ruff format --check` on staged `mark/` Python
  files.
- Each gate is proven with a planted violation in `scripts/prove-gates.sh` (a print, five
  parameters, unformatted code, a skipped test), with a no-op control plant
  ([README.md](README.md) section 5).

## 7. Security

- No secrets in the repo: no webhook URLs, auth keys, bearer tokens, `.env` files, QA
  inbox or allow-list addresses, template URL or instance ids. They live in
  `mark/local.config.json` (gitignored); the repo carries `local.config.example.json` with
  placeholders, and `build.py` injects the values into the generated code steps.
- **The private values are checked when `_config.py` loads them** (a bad value raises at
  import, naming no value); the built steps hold the literals:
  - `allow_list`: a list of valid addresses and a list of bare domains. A domain entry admits
    everyone at that domain, so never list a public mail provider unless everyone there may
    receive reports;
  - `qa_inbox`: a valid address on the allow-list;
  - `webhook_trigger_name` (optional): the `trigger_name` a webhook run carries, one line of
    text. A payload counts only on a run with exactly this name; when it is absent, no run
    counts as a webhook. It is filled by the orchestrator model like every input, so it is
    a gate against mistakes, not authentication (the webhook's auth key is);
  - `template_url` (`_url.py`): at most 2,000 characters, and exactly `https://`, a host,
    and an optional path. The host must pass the shared hostname rule (`valid_domain`), so
    a port, userinfo, or a query or fragment straight after the host is refused. The path is
    `/` followed only by letters, digits, `. _ ~ ! $ & + , ; = : / ? # -` and `%XX` escapes
    (no spaces, quotes, `@`, `<` `>`, brackets, braces, backticks, `|` or `*`). The URL may
    not end in `.` `,` `;` `:` `!` `?` `_` `~`, which a Markdown autolinker drops. It is
    echoed into the corrected-file request as an explicit Markdown link,
    `Template: [CSV template](https://...)`, with the configured URL in the parentheses.
    - **Setup:** point it at a public HTTPS copy of the CSV template, such as the raw-file URL
      of `demo/template.csv` in the published repository. Open the URL in a private browser
      window before relying on it: the link is shown to the marketer as is, and nothing
      checks that it resolves. A request caused by our side (the tool or the platform
      failed) gets no template link.
- The email recipient allow-list is enforced in code (`send_email`, section 2), never only in
  a prompt. File contents are data: an address inside a file is never a recipient.
- Code steps hold no credentials. Tool auth is configured on the registry, not in steps.
- Chat, email and canvas output show untrusted text as text (`md_text`, section 2), so a
  planted link, image or tag can't render and a cell can't break the report layout.
- Agents have no side-effecting tools, and verdicts are computed in code.
- A security review against this section and [TOOL.md](TOOL.md) section 3 runs before
  submission.
