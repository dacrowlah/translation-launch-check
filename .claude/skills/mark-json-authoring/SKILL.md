---
name: mark-json-authoring
description: Use when creating or changing Optimizely Agent Platform (Mark) specialized agents, workflow agents or skills as files - export/import JSON, schema_version, step_type, for_loop, condition, code step, parameters_schema, triggers, skill pins in prompts, or laying out the workflow canvas so it renders readable.
---

# Authoring Mark agents and workflows as JSON

Author in files, import, verify. Never type prompts into Mark's editor (it eats text after
`/`). Shapes below are from real exports of a live instance (2026-11), `schema_version`
**1.3**. Optimizely's public `optimizely/opal-agent-examples` repo has more (older schema
versions). Platform behaviour behind these rules: the `mark-platform` skill.

Templates: [agent-example.json](agent-example.json),
[workflow-example.json](workflow-example.json). They show valid structure (the workflow's
code bodies are stubs); they are **not importable as-is**: the tool `example_check` and the
skill `example-glossary` exist in no instance, and generic ids such as `example_reviewer`
can collide in a shared org, where "Reuse existing" would bind to someone else's agent.
Rename every id, tool and skill to your own before importing. Both examples and
`mark-code-step-patterns/example_step.py` use one route-token family with the reserved
prefix `example_route_`.

## Specialized agent (export format)
Key fields: `schema_version: "1.3"`, `agent_type: "specialized"`, `agent_id` (the `@id`),
`name`, `description`, `prompt_template`, `parameters[]`
(`{name, type, required, description, default, item_type, min_items, max_items}`; types
string/number/boolean/datetime/object/file), `enabled_tools[]` (tool names; tools must already
exist in the instance), `output: {type: "json", description, schema: <JSON Schema object>}`
(enforced), `is_enabled_in_chat`, `conversation_mode: false`, `inference_type`,
`agent_metadata: {enable_auto_skill_prediction, enable_auto_skill_prediction_by_tools}`.
Workflow-step agents: `is_enabled_in_chat: false`, no `ask_user_question` (steps run
single-turn), minimum tool list, and inputs that the agent echoes back (item key, checksum)
so the next step can check them.

### Skill references inside `prompt_template` (verified)
| Write | Effect |
|---|---|
| `` {skill: `example-glossary`} `` | **Pins** that org skill (backticks required); injected as `## Organization Instructions`. |
| `{skill: example-glossary}` | A **search query**, not a pin - it did not load the skill. |
| `{skill: **auto-tool**}` | Auto-attaches skills whose When-to-use tools the agent calls (sets `enable_auto_skill_prediction_by_tools: true` on import). |
| `{skill: **auto**}` | Auto-select by prompt (not verified). |

Variables: `[[locale]]`. Mention tools in backticks: `` `example_check` ``.

## Workflow (export format)
Top level: `schema_version: "1.3"`, `agent_type: "workflow"`, `workflow_type: "deterministic"`,
`agent_id`, `name`, `description`, `triggers[]`, `steps[]` (flat list),
`specialized_agents[]` (full agent objects - an export bundles them; `[]` imports fine,
the reference resolves to the agent already in the instance - verified),
`specialized_agents_required[]` (agent_ids), `agent_metadata: {nodes[], edges[]}`.

| step_type | Fields |
|---|---|
| `specialized` | `agent_id` (string id), `parameters_schema`, `next_step_id`, `timeout_seconds`, `is_interactive: false` |
| `code` | `language: "python"`, `code`, `parameters_schema`, `next_step_id`, `timeout_seconds` (default 30; at most 300 per docs, not re-verified) |
| `for_loop` | `items_source` (upstream field name, e.g. `"locales"`), `item_name`, `max_iterations`, `parallel`, `child_steps[]` (full steps; a code step may come first, verified 2026-11), `next_step_id`. `max_iterations` is not validated on import (100000 was saved as-is, verified 2026-11) |
| `condition` | `conditions[]`: `{match_type, matching_condition, target_step_id, priority, case_sensitive}`; else branch `match_type: "else"`, `matching_condition: ""`; `next_step_id: null` |

`language: "javascript"` also exists (Node 24, `async function handler(input, ctx)`), but a
JavaScript step **cannot call any tool** - there is no tool SDK for it (verified 2026-11).
Use Python for every step that calls a tool; this repo uses Python for all steps.

### `parameters_schema`
Entries: `{"<name>": {"type": "predicted" | "static", "value_type": "string"|"number"|"boolean"|"object"|"array", "required": bool, "description": "...", "value": null | <static value>}}`.
- **`value_type` must match `^(string|number|boolean|array|object)$`**: a code-step input
  can't be a file (the save API answers 422 for `"file"`, verified 2026-11). Files reach a
  code step only through `ctx["input_dir"]` (chat attachments) or a tool.
- `predicted` = filled by the orchestrator model from the trigger and prior outputs, so the
  `description` is the wiring - name the source step and field and say "copied exactly"
  or "unchanged".
- **`static` is ignored on agent steps inside a `for_loop`** (verified: a required static
  input fails the iteration) - use `predicted` with a description that pins the value.
- **Size:** a code step's whole input is capped at 75,776 bytes as Mark wraps it (about
  1.32x your JSON in one ASCII measurement), and going over fails the run before the code starts (verified
  2026-11). Give code steps small inputs (keys, routes, checksums, a run key) and keep
  large data in run-folder files (see `mark-code-step-patterns`). Agent steps took about
  72 KB without trouble; cap their inputs in code anyway.
- **Never declare the whole trigger as one input.** Chat pastes the attached file into
  `text_content` and email runs carry the HTML body, so the whole trigger can exceed the
  cap (inferred from the cap and the trigger contents, not separately tested). Declare
  narrow inputs, each `required: false` where the trigger may lack it:
  - `trigger_name`: "trigger_context.trigger_name, unchanged";
  - `email_sender`: "trigger_context.email_payload.sender, unchanged";
  - `email_attachments`: "trigger_context.email_payload.attachments, unchanged";
  - `webhook_payload`: "trigger_context.webhook_payload, unchanged" (it must itself fit
    the cap: senders measure the UTF-8 bytes of the JSON body as sent and refuse above
    50,000, because over the cap the run fails before the code starts; the ratio comes
    from one ASCII measurement and non-ASCII expansion is untested).

  These are filled by the orchestrator model, not copied from the raw trigger (and that it
  resolves the `trigger_context.<path>` wording is not verified), so the code checks each
  before use and treats anything else as absent: email inputs only when `trigger_name` is
  `"Email"` (recorded) and the attachment has the recorded shape; the webhook payload
  only when its `package_sha256` verifies. The `trigger_name` value of webhook runs is
  not recorded, so never gate on a literal for it.

### Loops
- `items_source` names a field of an upstream step's output; each item is passed whole.
- A code step may be the first step in `child_steps` (verified 2026-11). Iterations ran
  mostly one after another despite `parallel: true` (about 25 s each for two code steps).
- A step after the loop that takes the loop output receives every iteration's full
  record, including the whole loop item (verified 2026-11). So when items are large,
  **end `child_steps` with a small code step** that saves the agents' answers to the run
  folder, and give the step after the loop only the run key and the `report_checksum` of
  the first step's file (see "Save the review" and "Score each locale" in the example);
  each review file carries the locale checksum it was given, and the step after the loop
  binds it to that locale's checksum in the verified report (two-layer read, see
  `mark-code-step-patterns`).
- The save step declares only small inputs (`run_key`, the item key, the item's
  `checksum`, the agents' answers), never the loop item: the code-step cap applies to it,
  while loop items themselves go to agent steps.
- Loop items are part of the first step's return, so cap their count (at most
  `max_iterations`; behaviour beyond it is not verified), each item (e.g. 60 KB) and their
  sum (e.g. 200 KB): the return limit is 256 KB (docs; how it is measured is not
  verified). Keep `max_iterations` and the code's count cap one shared constant. The
  workflow's own top-level `max_iterations` field (10 in the export) is a separate setting
  from the loop's; its effect is not verified, so it is left as exported.
- One failed iteration stops the workflow: generous `timeout_seconds` on loop agents.

### Conditions
A `condition` matches against the **previous step's whole output** text (after a loop: the
aggregated iteration output), user copy included. Make the producing code step emit a
route token with a reserved prefix as a value and match the whole token with
`match_type: "regex"` and `case_sensitive: true`:
`"matching_condition": "\\bexample_route_fix\\b"` (JSON-escaped `\b`). The first code step
rejects the prefix in user copy (any case), so copy that reaches a condition's input
(e.g. the loop items in "Read the input") can't force a branch. `regex` conditions
were verified (2026-11, evaluated classically, no model); the `\b` form is standard regex,
not tested separately. Avoid `contains` or short tokens like `fix`, which also match
`fixed`, `fix_first` or a line of copy.

**Design rule: a condition should only ever follow a code step.** The platform allows a
condition directly after a loop (verified: it read the agents' aggregated output) or an
agent step, but don't place one there. It would read agents' answers, and an agent can
emit any token (quoting look-alike copy, or under prompt injection); the prefix check
covers user copy only. Both examples put a code step ("Read the input", "Score each
locale") before each condition for this reason.

**Branch join is allowed** (verified 2026-11): two steps may lead into the same step (a
condition's `target_step_id` and another step's `next_step_id` pointing at one step). It
runs once per run. The example's "Write the report" is reached from both branches.

### Triggers
- Chat: `{trigger_id, trigger_type: "message", name, description, is_active}`; one per
  workflow.
- Webhook export (verified): `{trigger_id, trigger_type: "webhook", name, description,
  is_active, priority: "background", auth_key: null, auth_header_name, auth_header_format,
  payload_content_type}`.
- Email: configure it in the UI after import (exports strip its address). Its saved
  settings include `sender_filters` (at least one), `subject_filters`,
  `attachment_processing: true` and `max_email_size_mb: 25`. Emailed attachments do not
  reach `input_dir` (verified 2026-11); read them with `create_csv_canvas` (see
  `mark-platform`).
- Scheduler: configure in the UI after import.

**Not the same as the save API's internal format** (`type`, `parameters`, steps as a dict,
`go_to_step_id`, agent UUIDs). Use the export format for files.

## Canvas layout that reads well
Positions are `agent_metadata.nodes[]`: `{id, position: {x, y}}`; a loop container also has
`width`, `height`; a loop child has `parentId` (the loop's step_id) and a position **relative
to the container**. Edges are derived from `next_step_id` / loop children / condition targets;
only the trigger edge needs listing. Recipe:
- Main flow one column (`x` fixed), rows 220 px apart; branches 360 px to the side; a
  branch that ends sits beside the condition's next row; nothing closer than 80 px.
- Loop container: first child at `{x: 40, y: 80}`, children 160 px apart, 40 px padding
  below the last. Assuming a step node about 68 px tall, height =
  `80 + 160 * (children - 1) + 68 + 40` (348 for two children); width 320. Check the real
  node size in the first screenshot and adjust the constant.
- Short human step names ("Read the input", "For each locale", "Save the review").
- Generate positions in a build script from one layout table; after import, screenshot the
  canvas and fix overlaps in the table, not by hand.

## Import / export (UI)
- Export: `...` -> Download agent -> **Copy as JSON** (or ZIP with files). Exports strip
  webhook URLs, auth keys, emails; attached files aren't in JSON.
- Import: Agents -> Add Agent -> **Upload Agent** -> paste or drop the file -> Next. A workflow
  lists its referenced agents with a dropdown that **defaults to "Create new copy"** (makes
  `<id>-copy1`); choose **"Reuse existing"** (or "Overwrite existing" only for agents you own)
  -> trigger reconfiguration -> **Import Agent**. Imported workflows get new webhook URLs;
  reconfigure email/scheduler triggers.
- Round-trip check: export what you imported and diff against your source.

## Skills as files
Keep each skill's text + When-to-use in the repo; create it in Context -> Skills (or Import
Skills). Export JSON fields: `title`, `skill`, `skill_semantics`, `trigger_type`,
`trigger_tools`, `mention_handle`. `trigger_type` is `"keyword"` (phrases in
`skill_semantics`) or `"tool"` (names in `trigger_tools`); the import refuses the plurals
`"keywords"`/`"tools"` as "Invalid skill JSON format" (verified). Organization skills only
for agents; give each a shortcut.
Write skills as unconditional rules - an injected "if this applies" skill was ignored.

## Common mistakes
| Mistake | Fix |
|---|---|
| `{skill: name}` without backticks | `` {skill: `name`} `` |
| `step_type: "loop"` / `collection` / `body_start_step_id` | `for_loop` / `items_source` / `child_steps` |
| Loop children listed in top-level `steps` | Put them in the loop's `child_steps` |
| Step after a loop takes the loop's output when items are large | Save step at the end of the body; pass only the run key |
| Whole trigger object as one code-step input | Narrow inputs (`trigger_name`, `email_attachments`, ...) |
| `value_type: "file"` on a code step | Not allowed (422); read files from `input_dir` or via a tool |
| `contains "fix"` / `route.*fix` | Whole-token regex on a distinctive route token |
| A condition directly after an agent step or a loop | Put a code step in between that emits the route token |
| `max_iterations` and the code's item cap set separately | One shared constant; reject extra items in code |
| Static input on an agent inside a loop | `predicted` with a pinning description |
| Absolute positions for loop children | Relative to the container, with `parentId` |
| Agent referenced by UUID in an export | Use the string `agent_id` |
| Importing the templates unchanged | Rename ids, tools and skills first |
| Mixing export and internal (save API) shapes | One format per file |
