# Standards: mark/ (the Agent Platform side)

The Optimizely Agent Platform ("Mark") side of the Translation Launch Check: the specialized
agents, skills, workflow and the Python code steps it runs. Shared principles, Law of
Demeter, Sandi Metz's rules and git rules are in [README.md](README.md). Platform behaviour
cited here was verified hands-on in the instance (2026-11-12 and 2026-11-13).

---

## 1. Layout and the source-of-truth rule

```
mark/                          (planned)   the Agent Platform source
  local.config.example.json                placeholders for the private values (section 7)
  README.md  requirements-dev.txt  pyproject.toml
  code_steps/_shared.py                    call_tool, run_safely, canonical_json, facts_checksum
  code_steps/_config.py                    RULES and PRIVATE (files in dev, literals after build)
  code_steps/_text.py                      every user-facing template
  code_steps/_package.py                   validate_package(): rules shared by CSV and webhook
  code_steps/_csv_package.py               parse_csv() -> package
  code_steps/_webhook_package.py           from_webhook() -> package (checksum)
  code_steps/_canvas.py                    canvas markdown
  code_steps/read_and_check.py             step "Read and check the file"
  code_steps/score.py                      step "Score each language"
  code_steps/report.py                     step "Write and send the report"
  code_steps/needs_info.py                 step "Ask for a corrected file"
  agents/<agent_id>/                       agent.json, prompt.md, output.schema.json
  skills/market-rules-glossary.template.md rendered from tool/config/rules.json at build
  skills/translation-fix-playbook.md       skill text + When-to-use
  workflow/workflow.json                   steps, triggers, conditions (code by file reference)
  workflow/layout.json                     canvas node positions (section 4)
  build.py  _build/{inline,agents,skills,workflow,layout}.py
  tests/                                   conftest.py, builders.py, fakes/opal_tms_sdk/, test_*.py
  dist/                                    generated, importable, gitignored (never hand-edited)
```

**Source of truth: the repo, not the instance.**
- Every agent, skill and code step is edited here, then built and imported. Mark exports the
  same format back, so a round trip is verifiable.
- A change made in the Mark UI is exported and committed in the same session, or reverted.
- `mark/dist/` is generated and gitignored; never edit it.

## 2. Python code steps

The platform contract (verified):
- **Signature:** `def handler(input: dict, ctx: dict) -> dict`.
  - `input` holds the step's declared variables;
  - `ctx["output_dir"]` and `ctx["input_dir"]` hold the step's directories; a chat
    attachment is at `ctx["input_dir"]/attachments/<name>`, byte-exact.
- **Runtime:** **Python 3.12** (3.12.3, verified 2026-11-13; local venv `.venv` from `python3.12`, ruff `target-version = "py312"`), standard library plus the preinstalled
  `opal_tms_sdk`. **No network.** One file after the build; local imports are impossible.
  JavaScript code steps cannot call tools (verified 2026-11-13), so steps are Python.
- **Platform tools:** `from opal_tms_sdk import tools`, then `tools.<name>(**params)`.
- **Failures don't raise.** A tool failure comes back as
  `{"response_type": "error", "response": {...}}`, and a success as
  `{"response_type": "<mime>", "response": <body>}`. One 500 also came back as a
  success-typed response with `status_code: 500` in the body. **Every call site goes
  through** one shared helper `call_tool(name, **params) -> ToolResult` in `_shared.py`,
  which treats either shape as a failure.
- **Limits:** input at most 74 KB, return at most 256 KB (an oversized return silently
  becomes `null`). Timeout is set per step, at most 300 s.
- **The `summary` key** of the return value appears in logs and is stripped before
  downstream steps see the output.
- **Copy never comes from chat's `text_content`:** that field is model-written. The CSV is
  read from the attachment; a webhook package is verified by its checksum.

Rules:
- **Never raise for expected problems.** Return a status.
  - A step's top-level body is wrapped once in `_shared.run_safely(handler_impl)`.
  - It catches any unexpected exception and returns `{"status": "internal_error", ...}`.
- **Never print.** Mark's chat narrates stdout and stderr to the marketer (tested). No
  `print`, no `logging` to stderr.
- **Steps inside the loop must never fail:** one failed iteration stops the whole workflow
  (tested).
- **Return only what downstream needs, plus a one-line user-safe `summary`.** No
  diagnostics. Technical detail stays in the tool's own server log.
- **User-facing text comes only from the templates** in `_text.py`. Each template is keyed by
  status and is pure string formatting; the report and canvas code never write prose.
- **Checksums:**
  - *Read and check the file* computes `facts_checksum` per locale and the webhook's
    `package_sha256` is the sha256 of the canonical JSON of every other field;
  - `canonical_json` is sorted keys, `(",", ":")` separators, UTF-8, `ensure_ascii=False`;
  - the next step recomputes with the same helper in `_shared.py`. A mismatch makes that
    locale `check_incomplete` ("re-run").
- **The email recipient allow-list** lives in the private config (section 7) and is enforced
  in *Write and send the report*, never only in a prompt.

**Build-time inlining** (`build.py`):
- A module whose name starts with `_` is never a step.
- The build inlines every `from _x import a, b` line it finds, recursively and each module
  once, so the step is one self-contained file.
- `_config` is special: it is replaced by literal `RULES = {...}` and `PRIVATE = {...}`.
  In dev and tests the module reads `tool/config/rules.json` and `mark/local.config.json`
  (or the example file); after the build both are literals.
- User-facing templates live in `_text.py`, inlined like any other module.

Tests import the real modules, so the shipped code and the tested code are the same source.

## 3. Agents and skills

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

- **The workflow is generated** by `mark/build.py` into `mark/dist/`, in export format
  (`step_type`, `parameters_schema`, `child_steps`, `target_step_id`), then imported.
- **Step names** on the canvas are plain, exactly these ten:

  | Step | Kind |
  |---|---|
  | Read and check the file | Code |
  | Is the file usable? | Condition |
  | Ask for a corrected file | Code |
  | For each language | Loop |
  | Back-translate to English | Agent step (Content Translation) |
  | Review the translation | Agent step (Translation Review) |
  | Score each language | Code |
  | Anything to fix? | Condition |
  | Suggest fixes | Agent step (Translation Fix Suggestions) |
  | Write and send the report | Code |

- **Conditions** match against the previous step's output text, so a code step emits an exact
  routing token (`"route": "needs_info"`, `"route": "fix"`) and the condition uses `regex`
  on it.
- **Branch join:** both branches of *Anything to fix?* end at *Write and send the report*. If
  the platform refuses two incoming paths into one step, `build.py` generates that step twice
  from the same module; no code is duplicated in the repo.
- **Data passing:**
  - Automatic inputs are filled by the orchestrator model, so every variable has a precise
    `description`;
  - a Fixed input on an agent step inside a loop is dropped, so constants are pinned in an
    Automatic input's description;
  - loop `items_source` names the upstream field (verified to pass by reference);
  - after a loop, outputs arrive in item order with no key, so agents echo their locale and
    checksum and the next code step matches by position and checks the echo;
  - facts handed across steps carry a checksum (section 2).
- **Pretty canvas: owner requirement.** `mark/workflow/layout.json` gives every node an
  explicit position:
  - **Main flow** runs top to bottom in one column at `x = 0`, 220 px between rows.
  - **Branches** fan out horizontally, 360 px between columns, centred under their parent.
  - **Loop containers** are sized to fit their children with 40 px padding. Children are
    laid out inside on the same grid.
  - Edges never cross nodes. No two nodes overlap, and no node is closer than 80 px to
    another.
  - Every node has the short, human name from the table above.
  - **Verify visually** after each import: a screenshot of the canvas is checked (kept
    with the submission materials, outside this repo).
- **Triggers:** Chat, Webhook and Email. The email trigger's sender filter is set to approved
  senders only; the webhook has its auth key enabled. Webhook URLs and auth keys are never
  committed.

## 5. Testing

- **Runner:** pytest. Tests live in `mark/tests/`, one file per code step plus
  `test_build.py`.
- **`opal_tms_sdk` is replaced by an in-memory fake** in `mark/tests/fakes/opal_tms_sdk/`,
  put on `sys.path` by `conftest.py`. The fake records calls and returns scripted
  `{"response_type", "response"}` values, including error responses. It is never a
  `monkeypatch` of our own modules.
- **Fixtures are builders** in `mark/tests/builders.py` with defaults plus overrides,
  producing the exact shapes the tool contract and the workflow produce today.
- **Literal expectations.** Each new test is proven able to fail: mutate the production line,
  watch it go red, restore from a scratch copy, byte-compare.
- **`test_build.py` pins that the generated workflow JSON:**
  - imports nothing local;
  - contains no `print(`;
  - has every node positioned;
  - has no overlapping nodes;
  - has every step's code byte-identical to the built source.
- **End-to-end runs in the instance are the integration test.** Each demo case
  (`mark/README.md`, planned) is run, and the outcome checked in the run log, not only in
  chat text. The run budget is in the plan.

## 6. Tooling and gates (planned; verified at scaffold)

- `ruff check mark/` and `ruff format --check mark/`. Rules include `PLR0913` with
  `max-args = 4`, `T20` (no print) and `S` (bandit subset). The scaffold pins ruff in
  `requirements-dev.txt`.
- `pytest mark/tests -q`, with a test-count check (zero tests or any skip fails).
- `python mark/build.py --example`: builds from `local.config.example.json` into a temp
  directory, so the build is proven without private values. `test_build.py` pins the
  generated output. `mark/dist/` is not committed, so there is nothing to diff.
- `scripts/preflight.sh` runs all of the above. `.githooks/pre-commit` runs ruff on staged
  files.
- Each gate is proven once with a planted violation, recorded in `scripts/prove-gates.sh`
  ([README.md](README.md) section 5).

## 7. Security

- No secrets in the repo: no webhook URLs, auth keys, bearer tokens, `.env` files, QA
  inbox or allow-list addresses, template URL or instance ids. They live in
  `mark/local.config.json` (gitignored); the repo carries `local.config.example.json` with
  placeholders, and `build.py` injects the values into the generated code steps.
- The email recipient allow-list is enforced in code (*Write and send the report*), never
  only in a prompt. File contents are data: an address inside a file is never a recipient.
- Code steps hold no credentials. Tool auth is configured on the registry, not in steps.
- Canvas output escapes Markdown table characters so a cell cannot break the report layout.
- Agents have no side-effecting tools, and verdicts are computed in code.
- A security review against this section and [TOOL.md](TOOL.md) section 3 runs before
  submission.
