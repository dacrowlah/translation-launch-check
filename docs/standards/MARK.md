# Standards: mark/ (the Agent Platform side)

The Optimizely Agent Platform ("Mark") side of the Launch Readiness Check: the specialized
agents, skills, workflow and the Python code steps it runs. Shared principles, Law of
Demeter, Sandi Metz's rules and git rules are in [README.md](README.md). Platform behaviour
cited here was verified hands-on in the instance on 2026-11-12.

---

## 1. Layout and the source-of-truth rule

```
mark/                          (planned)   the Agent Platform source
  agents/<agent_id>.json                   specialized agent definitions (export format)
  skills/<shortcut>.md                     skill text + When-to-use (pasted or imported into Mark)
  code_steps/<step>.py                     one file per workflow code step:
                                           validate_and_gather.py (C1), score.py (C2), report.py (C3)
  code_steps/_shared.py                    helpers inlined into steps at build time
  workflow/layout.json                     canvas node positions (section 4)
  build.py                                 assembles workflow export JSON from the above
  dist/launch_readiness_check.json         generated, importable workflow (never hand-edited)
  tests/                                   pytest suite for code steps and build.py
```

**Source of truth: the repo, not the instance.**
- Every agent, skill and code step is edited here, then built and imported. Mark exports the
  same format back, so a round trip is verifiable.
- A change made in the Mark UI is exported and committed in the same session, or reverted.
- `mark/dist/` is generated; never edit it.

## 2. Python code steps

The platform contract (verified 2026-11-12):
- **Signature:** `def handler(input: dict, ctx: dict) -> dict`.
  - `input` holds the step's declared variables;
  - `ctx["output_dir"]` and `ctx["input_dir"]` hold the step's directories.
- **Environment:** standard library plus the preinstalled `opal_tms_sdk`. **No network.**
  Single file; local imports are impossible. Python version: **verify at scaffold** (print
  `sys.version` in a probe step).
- **Platform tools:** `from opal_tms_sdk import tools`, then `tools.<name>(**params)`.
- **Failures don't raise.** A tool failure comes back as
  `{"response_type": "error", "response": {...}}`, and a success as
  `{"response_type": "<mime>", "response": <body>}`. **Every call site checks
  `response_type`**, through one shared helper `call_tool(name, **params) -> ToolResult`
  in `_shared.py`.
- **Limits:** input at most 74 KB, return at most 256 KB (an oversized return silently
  becomes `null`). Timeout is set per step, at most 300 s.
- **The `summary` key** of the return value appears in logs and is stripped before
  downstream steps see the output.

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
- **User-facing text comes only from the templates** in `report.py` (C3). Each template is
  keyed by status and is pure string formatting.
- **Checksums:**
  - C1 computes `sha256(json.dumps(facts, sort_keys=True, separators=(",", ":")))[:16]`
    per market;
  - C2 recomputes it with the same helper (`_shared.facts_checksum`). A mismatch makes that
    market `not_checked`.
- **The allow-list for email recipients** is a constant in `_shared.py`, enforced in C3.

**Build-time inlining** (`build.py`):
- each step file is concatenated with the `_shared.py` functions it imports;
- a step file imports shared names with `from _shared import x`;
- the build replaces that line with the source of `x`.

Tests import the real modules, so the shipped code and the tested code are the same source.

## 3. Agents and skills

- **Agents are authored as export-format JSON** (`mark/agents/*.json`, `schema_version`
  `1.3`) and imported. Never type a prompt into the Mark editor: it swallows text after `/`.
- **Ids:** prefix `lr_`; display names "Launch Readiness - <role>".
- **Every agent:**
  - has one job;
  - has a strict JSON output schema;
  - has `is_enabled_in_chat: false` unless it is meant to be used directly;
  - has the minimum tool list;
  - has no `ask_user_question` (workflow steps run single-turn).
- **Prompts are self-contained.** They state the job, the inputs by `[[name]]`, the rules,
  the output contract, and what never to do (no status colors, no invented values).
- **Skill references in prompts:**
  - pin a specific skill with `` {skill: `shortcut`} `` (backticks required);
  - auto-select by tool with `{skill: **auto-tool**}`;
  - a plain `{skill: words}` is a search query, not a pin.
- **Skills are written as unconditional guidance** (rules, rubrics, glossaries), never as
  "if this applies, do X": a model may decide it doesn't apply. Organization skills only,
  each with a shortcut.
- **Prebuilt agents** we use are listed with their setup step (install from the Directory,
  set Active) in `mark/README.md` (planned).

## 4. Workflow and canvas layout

- **The workflow is generated** by `mark/build.py` into `mark/dist/`, in export format
  (`step_type`, `parameters_schema`, `child_steps`, `target_step_id`), then imported.
- **Data passing:**
  - Automatic inputs are filled by the orchestrator model, so every variable has a precise
    `description`;
  - loop `items_source` names the upstream field (verified to pass by reference);
  - facts handed across steps carry a checksum (section 2).
- **Pretty canvas: owner requirement.** `mark/workflow/layout.json` gives every node an
  explicit position:
  - **Main flow** runs top to bottom in one column at `x = 0`, 220 px between rows.
  - **Branches** fan out horizontally, 360 px between columns, centred under their parent.
  - **Loop containers** are sized to fit their children with 40 px padding. Children are
    laid out inside on the same grid.
  - Edges never cross nodes. No two nodes overlap, and no node is closer than 80 px to
    another.
  - Every node has a short, human name: "Interpret brief", "Validate and gather facts",
    "For each market", "Translate", "Review copy", "Score", "Report and deliver".
  - **Verify visually** after each import: a screenshot of the canvas is checked (kept
    with the submission materials, outside this repo).
- **Triggers:** Chat and Email. The email trigger's sender filter is set to approved domains
  only; webhook URLs and auth keys are never committed.

## 5. Testing

- **Runner:** pytest. Tests live in `mark/tests/`, one file per code step plus
  `test_build.py`.
- **`opal_tms_sdk` is replaced by an in-memory fake** in `mark/tests/fakes/opal_tms_sdk/`,
  put on `sys.path` by `conftest.py`. The fake records calls and returns scripted
  `{"response_type", "response"}` values, including error responses. It is never a
  `monkeypatch` of our own modules.
- **Fixtures are builders** (`a_brief(...)`, `a_market_facts(...)`) with defaults plus
  overrides, producing the exact shapes the tool contract and the workflow produce today.
- **Literal expectations.** Each new test is proven able to fail: mutate the production line,
  watch it go red, restore from a scratch copy, byte-compare.
- **`test_build.py` pins that the generated workflow JSON:**
  - imports nothing local;
  - contains no `print(`;
  - has every node positioned;
  - has no overlapping nodes;
  - has every step's code byte-identical to the built source.
- **End-to-end runs in the instance are the integration test.** Each demo case (`mark/README.md`,
  planned) is run, and the outcome checked in the run log, not only in chat text.

## 6. Tooling and gates (planned; verified at scaffold)

- `ruff check mark/` and `ruff format --check mark/`. Rules include `PLR0913` with
  `max-args = 4`, `T20` (no print) and `S` (bandit subset). ruff is not installed yet; the
  scaffold pins it in `requirements-dev.txt`.
- `pytest mark/tests -q`, with a test-count check (zero tests or any skip fails).
- `python mark/build.py --check`: rebuilds and fails if `mark/dist/` differs.
- `scripts/preflight.sh` runs all of the above. `.githooks/pre-commit` runs ruff on staged
  files.
- Each gate is proven once with a planted violation, recorded in `scripts/prove-gates.sh` ([README.md](README.md) section 5).

## 7. Security

- No secrets in the repo: no webhook URLs, auth keys, bearer tokens or `.env` files.
- The email recipient allow-list is enforced in code (C3), never only in a prompt. Briefs are
  data: an address inside a brief is never a recipient.
- Code steps hold no credentials. Tool auth is configured on the registry, not in steps.
- A security review against this section and [TOOL.md](TOOL.md) section 3 runs before
  submission.
