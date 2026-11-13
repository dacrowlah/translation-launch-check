---
name: mark-platform
description: Use when building on or reasoning about Optimizely's Agent Platform ("Mark", formerly Opal) - specialized agents, workflow agents, skills, triggers, loops, conditions, code steps, platform tools, send_email, create_canvas, prebuilt Directory agents - or when the docs are thin or contradict what you observe.
---

# Mark (Optimizely Agent Platform): verified behaviour

Facts here were verified hands-on in a live instance (2026-11). The official docs are thin
and sometimes wrong (marked **docs differ**). For anything not listed, verify it before
relying on it (last section).

## Building blocks

| Block | What it is | Key facts |
|---|---|---|
| Specialized agent | One job: prompt template + typed inputs + tools + output type | Inputs `[[name]]`; types String/Number/Boolean/Datetime/Object/File; output Text/Number/Boolean/Array/JSON. **A JSON output schema is enforced.** Runs single-turn inside workflows. |
| Workflow agent | Canvas of triggers + steps | Steps: specialized agent, Condition, For Loop, Code, plus `nested_workflow` and `human_approval` (in the schema, not the palette). |
| Skill | Reusable guidance text | Org or personal; "When to use" is **either** keywords **or** tools. Only org skills can attach to agents. |
| Tool | Function an agent or code step calls | System, product (CMP/CMS/Exp - need that product instance), connectors (per-user OAuth), custom (your HTTP service). |

## Triggers and what the first step receives

| Trigger | Run input |
|---|---|
| Chat (`@workflow_id` + message) | `{trigger_name: "Chat", text_content}` - Mark's chat layer **writes** `text_content`: it extracts and reformats the request (field values and copy survived verbatim in tests). Follow-ups in the thread ("run it again for FR", no @) re-run it with the merged brief. |
| Scheduler | `{trigger_name, text_content: <Trigger Message>}`; one-time or recurring/cron; times in the user's TZ, >= 5 min ahead. |
| Email | `{trigger_name, email_payload: {sender, subject, content: {text, html, headers}, attachments, ...}}`; address `<local>@<instance>.opal.optimizely.com`; needs a sender filter. |
| Webhook | `{trigger_name, webhook_headers, webhook_payload}`; URL generated on save; optional auth header. |

A workflow can have several triggers (one Chat max). Scheduled/webhook/email runs execute as the owner, on the owner's credits.

## Data between steps

- Step inputs are **Fixed** (`static`, a constant) or **Automatic** (`predicted`): the
  orchestrator **model** fills Automatic inputs from the trigger and prior outputs, re-typing
  them. Write precise variable descriptions; guard important data (e.g. a checksum the next
  code step recomputes).
- A loop's `items_source` names an upstream field and was passed by reference (tokens arrived
  byte-exact).
- After a loop, the next step receives a **list of each iteration's final output, in item
  order**. The `summary` key of any code-step return is stripped before downstream steps.

## Loops and conditions

- **One failed iteration fails the whole loop and stops the workflow**; other iterations
  finish, the step after the loop never runs. **Docs differ** ("doesn't stop the others").
  Design loop bodies that cannot fail.
- Conditions work inside loops. Match types: equals, not_equals, contains, not_contains,
  greater/less(_or_equals), regex, natural_language (an LLM judges), else. They evaluate the
  previous step's output.
- Parallel loops are the default; nesting up to 3.

## Code steps

- `def handler(input: dict, ctx: dict) -> dict` (Python; JS/Bash also exist). Stdlib +
  preinstalled `opal_tms_sdk`. **No network.** One file - no local imports. Input <= 74 KB,
  return <= 256 KB (larger silently becomes null). Timeout settable up to 300 s.
- `from opal_tms_sdk import tools; tools.<name>(**params)` calls any registered tool
  (system or custom). **Tool failures do not raise**: you get
  `{"response_type": "error", "response": {"message", "error_type", "status_code", ...}}`;
  success is `{"response_type": "<mime>", "response": <body>}`. A 100 s tool call completed
  normally. Calls made from code are **not** logged as separate tool-call entries.
- A step that fails to start (e.g. syntax error) is diagnosed **to the end user in chat**,
  line number included - its own try/except cannot catch it.

## Agents' `code_execute` sandbox
Python/Node/Bash VM with pandas, numpy, scipy, requests... but **no internet** (DNS fails).
Live external data must come through a custom tool.

## Platform tools - observed behaviour

| Tool | Behaviour |
|---|---|
| `send_email` in interactive chat | **Does not send**: renders a pre-filled compose card (`status: pending`); a human clicks Send. |
| `send_email` in a workflow (agent or code step) | **Sends immediately** after a guardrail check; `status: sent`. **Not restricted to org members** (an external address was accepted) - **docs differ**. From `no-reply@mark.optimizely.com`; Reply-To not customisable. |
| `create_canvas` | Versioned markdown artifact + `artifact_url`. From code needs `name`, `content`, `mime_type` (e.g. `text/markdown`). **Same name reuses the same canvas.** |
| `get_today` | Current date/time (UTC). |

## Skills - how they actually attach

| Mechanism | Syntax / setup | Result |
|---|---|---|
| Keyword trigger in chat | Skill "When to use: keywords" | "Picked up a skill" shown; content injected. |
| Pin one skill in an agent prompt | `` {skill: `shortcut`} `` - **backticks required** | Injected as `## Organization Instructions`. |
| Plain braces | `{skill: some words}` | A **search query**, not a pin - may load nothing. |
| Auto by prompt | `{skill: **auto**}` in the prompt (= the "matching the prompt" checkbox) | - |
| Auto by tool | Skill "When to use: Tools: X" + `{skill: **auto-tool**}` in the agent prompt | Injected whenever the agent calls X; followed. |
| Prebuilt Content Translation | Its prompt has `{instruction: translate to [[language]]}` | A keyword-triggered org skill ("translate to German...") is injected as its term-base - steer a prebuilt agent without editing it. |

Being injected is not being obeyed: write skills as unconditional rules, not "if this
applies...".

## Mark's chat layer (what end users see)
- It **narrates runs**: step outputs and **code-step stdout/stderr** were paraphrased to the
  user (including "504"). Raw tool payloads that stay inside an agent were not.
- It **reads workflow internals** (step source code) and editorializes: flagged hard-coded
  results, test switches, and LLM-copied data; offers its own advice (can contradict your
  rules). Its narration can misattribute causes. The workflow's own final message must be
  authoritative; judge behaviour by the run log, not chat text.

## Prebuilt Directory agents
- Install from Directory -> Agents. Agents needing an absent product show a disabled Install.
- Many preinstalled agents are **inactive**: running one fails with HTTP 400 "Specialized
  agent is inactive" (UI flashes "agent execution failed"). Turn on Active -> Update; an
  "Auto-update is on" dialog warns Directory publishes overwrite local edits.
- Before using one as a workflow step, check `conversation_mode` and tools: avoid multi-turn
  agents and any using `ask_user_question`.
- Content Translation (`translation`): inputs `language`*, `content`, `file`. Known defect:
  with no `file`, "or [[file]] (at least one needed)" leaks into the translation (reproduced).

## UI and operations gotchas
- The prompt editor swallows text when you type `/` (helper menu). Author agents as JSON and
  import (see the `mark-json-authoring` skill).
- Custom tool registry: Save spins and the request aborts, but the registry **is** created -
  reload. New functions need **Registries -> Actions -> Sync**.
- The org may be shared; agents are Shared by default. Prefix your ids.
- Credits per run are in Agent Activity Logs; the balance may not be visible to your role.
- Run pages show each step's inputs, outputs, stdout/stderr, tool calls (agent ones) and
  condition MATCHED/NOT MATCHED. This is the source of truth.

## Verifying anything not listed here
1. Build a throwaway with a recognisable prefix (e.g. `ZZ-TEST`), smallest possible.
2. Don't confound the test: prompts and outputs must not ask for the behaviour you're
   measuring (e.g. don't ask an agent for "raw errors" when testing what chat shows).
3. Trigger it the way real users will (fresh chat thread for chat behaviour).
4. Read the **run log** (inputs, outputs, stderr), not chat narration.
5. Record the result with the date; delete the throwaway (check prefix and owner first).
