---
name: mark-json-authoring
description: Use when creating or changing Optimizely Agent Platform (Mark) specialized agents, workflow agents or skills as files - export/import JSON, schema_version, step_type, for_loop, condition, code step, parameters_schema, skill pins in prompts, or laying out the workflow canvas so it renders readable.
---

# Authoring Mark agents and workflows as JSON

Author in files, import, verify. Never type prompts into Mark's editor (it eats text after
`/`). Shapes below are from real exports of a live instance (2026-11), `schema_version`
**1.3**; working examples: [agent-example.json](agent-example.json),
[workflow-example.json](workflow-example.json). Optimizely's public
`optimizely/opal-agent-examples` repo has more (older schema versions).

## Specialized agent (export format)
Key fields: `schema_version: "1.3"`, `agent_type: "specialized"`, `agent_id` (the `@id`),
`name`, `description`, `prompt_template`, `parameters[]`
(`{name, type, required, description, default, item_type, min_items, max_items}`; types
string/number/boolean/datetime/object/file), `enabled_tools[]` (tool names; tools must already
exist in the instance), `output: {type: "json", description, schema: <JSON Schema object>}`
(enforced), `is_enabled_in_chat`, `conversation_mode: false`, `inference_type`,
`agent_metadata: {enable_auto_skill_prediction, enable_auto_skill_prediction_by_tools}`.

### Skill references inside `prompt_template` (verified)
| Write | Effect |
|---|---|
| `` {skill: `lr-glossary`} `` | **Pins** that org skill (backticks required); injected as `## Organization Instructions`. |
| `{skill: lr-glossary}` | A **search query**, not a pin - loaded nothing in testing. |
| `{skill: **auto-tool**}` | Auto-attaches skills whose When-to-use tools the agent calls (sets `enable_auto_skill_prediction_by_tools: true` on import). |
| `{skill: **auto**}` | Auto-select by prompt. |

Variables: `[[country_code]]`. Mention tools in backticks: `` `copy_fit_check` ``.

## Workflow (export format)
Top level: `schema_version: "1.3"`, `agent_type: "workflow"`, `workflow_type: "deterministic"`,
`agent_id`, `name`, `description`, `triggers[]`, `steps[]` (flat list), `specialized_agents[]`
(full agent objects - an export bundles them; the example file leaves it `[]` only because it was sanitized - importing with `[]` is **unverified**; test it, or keep the bundled agents), `specialized_agents_required[]` (agent_ids),
`agent_metadata: {nodes[], edges[]}`.

| step_type | Fields |
|---|---|
| `specialized` | `agent_id` (string id), `parameters_schema`, `next_step_id`, `timeout_seconds`, `is_interactive: false` |
| `code` | `language: "python"`, `code`, `parameters_schema`, `next_step_id`, `timeout_seconds` (<= 300) |
| `for_loop` | `items_source` (upstream field name, e.g. `"markets"`), `item_name`, `max_iterations`, `parallel`, `child_steps[]` (full steps; first must not be code), `next_step_id` |
| `condition` | `conditions[]`: `{match_type, matching_condition, target_step_id, priority, case_sensitive}`; else branch `match_type: "else"`, `matching_condition: ""`; `next_step_id: null` |

`parameters_schema` entries: `{"<name>": {"type": "predicted" | "static", "value_type": "string"|"number"|"boolean"|"object"|"array", "required": bool, "description": "...", "value": null | <static value>}}`.
`predicted` = filled by the orchestrator model from the trigger and prior outputs, so the
`description` is the wiring - be precise. Name the source field: a chat or scheduler run
arrives as `text_content` (chat rewrites it - see `mark-platform`), a webhook run as
`webhook_payload.<field>`, an email run as `email_payload.content.text`.

A `condition` matches against the **previous step's output** (after a loop: the aggregated list
of iteration outputs), so `contains "blocked"` hits any iteration whose output contains that
text. Make the producing step emit an unambiguous token (e.g. a code step returning
`"outcome": "fix_first"`), not a word that could appear in free text.

Triggers: webhook export (verified)
`{trigger_id, trigger_type: "webhook", name, description, is_active, priority: "background", auth_key: null, auth_header_name, auth_header_format, payload_content_type}`;
chat uses `trigger_type: "message"`. Scheduler and email triggers are easiest to configure in
the UI after import (their secrets/addresses are stripped from exports anyway).

**Not the same as the save API's internal format** (`type`, `parameters`, steps as a dict,
`go_to_step_id`, agent UUIDs). Use the export format for files.

## Canvas layout that reads well
Positions are `agent_metadata.nodes[]`: `{id, position: {x, y}}`; a loop container also has
`width`, `height`; a loop child has `parentId` (the loop's step_id) and a position **relative
to the container**. Edges are derived from `next_step_id` / loop children / condition targets;
only the trigger edge needs listing. Recipe:
- Main flow one column (`x` fixed), rows 220 px apart; branches fan out 360 px apart centred
  under their parent; nothing closer than 80 px.
- Loop container sized to its children + 40 px padding; first child at `{x: 40, y: 80}`;
  stack children 160 px apart inside.
- Short human step names ("Interpret brief", "For each market", "Score").
- Generate positions in a build script from one layout table; after import, screenshot the
  canvas and fix overlaps in the table, not by hand.

## Import / export (UI)
- Export: `...` -> Download agent -> **Copy as JSON** (or ZIP with files). Exports strip
  webhook URLs, auth keys, emails; attached files aren't in JSON.
- Import: Agents -> Add Agent -> **Upload Agent** -> paste or drop the file -> Next. A workflow
  shows its referenced agents ("Existing" vs **Create new copy** - copy makes `<id>-copy1`;
  pick the existing one or overwrite) -> trigger reconfiguration -> **Import Agent**. Imported
  workflows get new webhook URLs; reconfigure email/scheduler triggers.
- Round-trip check: export what you imported and diff against your source.

## Skills as files
Keep each skill's text + When-to-use in the repo; create it in Context -> Skills (or Import
Skills). Export JSON fields: `title`, `skill`, `skill_semantics`, `trigger_type`,
`trigger_tools`, `mention_handle`. Organization skills only for agents; give each a shortcut.

## Common mistakes
| Mistake | Fix |
|---|---|
| `{skill: name}` without backticks | `` {skill: `name`} `` |
| `step_type: "loop"` / `collection` / `body_start_step_id` | `for_loop` / `items_source` / `child_steps` |
| Loop children listed in top-level `steps` | Put them in the loop's `child_steps` |
| Code step first inside a loop | Start the loop body with an agent |
| Absolute positions for loop children | Relative to the container, with `parentId` |
| Agent referenced by UUID in an export | Use the string `agent_id` |
| Mixing export and internal (save API) shapes | One format per file |
