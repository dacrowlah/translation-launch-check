---
name: mark-platform
description: Use when building on or reasoning about Optimizely's Agent Platform ("Mark", formerly Opal) - specialized agents, workflow agents, skills, triggers, loops, conditions, code steps, data passed between steps, platform tools such as send_email, create_canvas and create_csv_canvas, prebuilt Directory agents such as Content Translation - or when the docs are thin or contradict what you observe.
---

# Mark (Optimizely Agent Platform): observed behaviour

Facts here were verified hands-on in a live instance in 2026-11, unless marked **(docs)**
(taken from Optimizely's docs, not re-verified), **(source)** (read from platform code,
not tested) or **not verified**. The official docs are thin and sometimes wrong (marked
**docs differ**). Each fact is stated as behaviour, then what follows from it and the
pattern to use. For anything not listed, verify it before relying on it (last section).

Companion skills: `mark-code-step-patterns` (how to write code steps),
`mark-json-authoring` (agents and workflows as import files), `opal-custom-tools` (your own
HTTP tools).

## Building blocks

| Block | What it is | Key facts |
|---|---|---|
| Specialized agent | One job: prompt template + typed inputs + tools + output type | Inputs `[[name]]`; types String/Number/Boolean/Datetime/Object/File; output Text/Number/Boolean/Array/JSON. **A JSON output schema is enforced.** Runs single-turn inside workflows. |
| Workflow agent | Canvas of triggers + steps | Steps: specialized agent, Condition, For Loop, Code, plus `nested_workflow` and `human_approval` (in the schema, not the palette; not exercised). |
| Skill | Reusable guidance text | Org or personal; "When to use" is **either** keywords **or** tools. Only org skills can attach to agents. |
| Tool | Function an agent or code step calls | System, product (CMP/CMS/Experimentation - need that product instance), connectors (per-user OAuth), custom (your HTTP service). |

## Triggers and what the first step receives

| Trigger | Run input |
|---|---|
| Chat (`@workflow_id` + message) | `{trigger_id, trigger_name: "Chat", text_content}`. Mark's chat layer **writes** `text_content`: it extracts and can reformat the request, and pastes an attached file's text into it. Follow-ups in the same thread ("run it again with the fixed file", no `@`) start a new run with a merged request. The chat file picker accepts text, .md, .csv, .tsv, .json, .xlsx, .docx, .pdf and more. |
| Scheduler | `{trigger_id, trigger_name, text_content: <Trigger Message>}`; one-time or recurring/cron; times in the user's time zone, at least 5 minutes ahead. |
| Email | `{trigger_id, trigger_name, received_at, email_payload: {sender, subject, content: {text, html, headers}, attachments, file_urls, inline_images, ...}}`. Each trigger gets an inbound address on Mark's mail domain (you choose the local part); it needs at least one sender filter. Attachments up to 25 MB. |
| Webhook | `{trigger_id, trigger_name, received_at, webhook_headers, webhook_payload}`; the value of `trigger_name` for webhook runs is **not recorded** (don't match a literal); URL generated on save (on import: "A new URL will be generated on import"); optional auth key. The import dialog has no auth-key field: after import, set it on the trigger node in the workflow editor (AUTHENTICATION -> Auth Key -> Update); it persists across a reload, so the docs' "can't be edited after saving" did not hold. Mark then expects the raw key in `X-Api-Key` (format `{token}`) whatever the imported JSON says; no key, a wrong key, or the key in `Authorization` (raw or `Bearer`) gets `401 {"detail":"Invalid or missing authentication key"}`. An optional payload JSON Schema is **(docs)**. `POST` answers 200 at once; the run is asynchronous. |

A workflow can have several triggers (one Chat trigger at most). Scheduled, webhook and
email runs execute as the workflow owner, on the owner's credits.

**The trigger object can be large** (chat: the pasted file text; email: the HTML body and
headers). Don't hand it whole to a code step - see the input cap below. Narrow inputs
(`trigger_name`, `email_attachments`, ...) are filled by the orchestrator model, not
copied from the raw trigger, so check each before use: email inputs on the recorded
`trigger_name` `"Email"` plus the attachment shape, a webhook payload on its own checksum
(see `mark-code-step-patterns`). That checksum proves integrity, not who sent it; the
webhook's auth key is the sender gate. A webhook payload is a code-step input, so it must
fit the 75,776-byte cap, which the step's own code shares (see below): a sender measures the
payload against what the receiving step's code leaves, as escaped JSON, and refuses above it.
A payload over the cap fails the run before any code runs, and the webhook caller is not
told.

### Files that come with a run (verified 2026-11)
- **Chat attachment:** lands at `ctx["input_dir"]/attachments/<name>`, byte-exact (same
  SHA-256 as the local file), also for a 5.7 MB CSV, which a code step then parsed from
  disk. `text_content` is model-written. **Pattern:** read the file from `input_dir`,
  never copy from `text_content`; large files come in this way, not as step inputs.
- **Email attachment: does not land in `input_dir`** (it is empty). The trigger carries only
  metadata in `email_payload.attachments[]`: `{url, file_id, filename, size_bytes, size_mb,
  content_type}`; the `url` is an internal storage link that a code step cannot fetch (no
  network). Code-step inputs cannot be files either (see `mark-json-authoring`).
  **Workaround that works:** from a Python code step call
  `tools.create_csv_canvas(title=..., csv_urls=[url])`; it fetches the file server-side and
  returns the full text in `response.data.content` (plus `size`), byte-exact (CRLF and
  non-ASCII letters kept). Check `len(content.encode("utf-8"))` against `size_bytes`.
  **Side effect:** every call creates one private CSV canvas in the owner's Artifacts, and
  the Artifacts UI has no delete - check the attachment's name and size before calling.
  Tested with a CSV only.

## Data between steps (verified 2026-11)

- **Inputs are Fixed (`static`) or Automatic (`predicted`).** The orchestrator model wires
  Automatic inputs from the trigger and earlier outputs, guided by the variable's
  `description`. Write precise descriptions: they are the wiring.
- **Upstream values are passed by reference, not retyped** (tested with a 52 KB array). The
  model still chooses what to wire, so guard data that must not drift with a checksum the
  reading step recomputes.
- **A Fixed input on an agent step inside a loop is not passed** - a required one fails
  every iteration ("Parameter ... is required ... but not found on predicted_parameters").
  **Pattern:** make it Automatic with a description that pins the value ("Always exactly
  the word English").
- **A code step's input event is capped at 75,776 bytes**, measured on Mark's wrapped
  payload, which was about 1.32x the JSON passed in one ASCII measurement
  (non-ASCII expansion untested). Over the cap the step **fails** ("Code
  step event payload is too large"), is retried 3 times, and the run fails before your
  code runs. Nothing is truncated silently. **Pattern:** narrow, small code-step inputs
  (never the whole trigger object); large data in files (next point) with a reference
  plus checksum.
- **The step's own code counts toward that cap** (verified 2026-11-15). With a tiny input,
  code of 68,200 and 70,700 bytes ran; 73,200 bytes and more failed with "Code step failed
  with exit_code=-1:", no stderr and no "payload too large" message, retried, and the run
  failed. **Pattern:** keep a step's built code at most about 60,000 bytes, and its
  JSON-escaped code plus escaped input at most about 68,000 bytes; give each step a code
  ceiling and derive its input caps from what is left.
- **Files persist between the steps of one run:** a file written under `/workspace/...` by
  one code step was read intact by a later one. **Pattern:** a run folder
  `/workspace/<project>/<run_key>/` holding `{data, checksum}` files; steps pass only the
  run key, routing tokens and checksums. The step harness says files persist "for the
  workflow run" and parallel steps share one machine **(source; not verified across
  parallel steps)**, so give each parallel iteration its own file. Whether `/workspace` is
  empty at the start of each run is **not verified**: give each run its own random key.
- **Agent steps accept large inputs**, tested to about 72 KB inside a loop (arrived
  intact). The ceiling is **not verified**, and an agent step that fails stops the
  workflow. Loop items go to agent steps, so the 75,776-byte code-step cap does not apply
  to them - but it does apply to a code step that receives them: one after the loop that
  takes the loop output, or a save step that declared the item as an input. **Pattern:**
  an agent may take one item's full text; the first code step caps the item count (the
  loop's `max_iterations`), each item (e.g. 60 KB) and the sum of all items (e.g. 200 KB,
  so its own return stays under the 256 KB limit (docs; how it is measured is not
  verified, so keep the numbers conservative)).
- **A step's return value travels as a stdout line** (`__OPAL_OUTPUT__:{...}`), and the
  `summary` key shows in the run log and is stripped before downstream steps see the
  output.

## Loops

- **One failed iteration fails the whole loop and stops the workflow**; the other iterations
  finish, the step after the loop never runs. **Docs differ** ("doesn't stop the others").
  **Pattern:** loop bodies that cannot fail.
- `items_source` names an upstream field; items arrive character-for-character (passed by
  reference). `parallel: true` is the default, but iterations ran **mostly one after
  another**: in one run, 25 iterations of two code steps took 1,305 s (about 52 s of wall
  time each). At most 4 child steps (about 2 iterations) ran at once, and each code step
  took about 7.5 s (at most 13 s), so most of the time is scheduling between steps. That
  run cost 158 credits, about 6 per iteration. **Pattern:** keep the iteration count small
  (one per language, not one per chunk of a file); per-item time and credits add up.
- **A step after a loop that takes the loop output receives each iteration's full
  execution record**, in item order, not just the agent's answer:
  `{status, output_data: {response, metrics, token_usage, ...}, iteration_context:
  {loop_item: <the whole item>, ...}}`. So every large loop item is
  passed again to that step and can break the 75,776-byte code-step cap.
- **A code step at the end of the loop body receives only its declared inputs** (the
  agent's answer, not the large loop item).
- **Pattern (verified end to end):** end each iteration with a small code step that saves
  the agents' results to the run folder (one file per item key); the step after the loop
  takes only the run key and reads the files. A missing file means that item was not
  checked. It scales: a step after a 25-iteration loop read all 25 files with a 27-byte
  input.
- **A code step can be the first step in a loop body** (it imported and ran, loading each
  chunk from the run folder).
- **`max_iterations` is not validated on import:** 100000 was accepted and saved as-is.
  What happens to items beyond `max_iterations` (dropped, or the run fails), and at large
  counts, is **not verified**: check the count in code before the loop.

## Conditions

- Match types: `equals`, `not_equals`, `contains`, `not_contains`, `greater_than`,
  `less_than`, `greater_than_or_equals`, `less_than_or_equals`, `regex`, `natural_language`
  (an LLM judges), `else`. They evaluate the **previous step's whole output text** (after a
  loop: the aggregated iteration output), user copy included. The run view shows
  MATCHED / NOT MATCHED per branch.
- **`regex` works and is evaluated classically, not by a model** (`route.{0,4}fix`
  matched; the run log says `"evaluated_by": "classical"`). **Pattern:** a code step emits
  a route token with a reserved prefix (`"route": "example_route_fix"`) and the condition
  matches the whole token (`\bexample_route_fix\b`). **A case-sensitive `regex` with `\b`
  works** (verified 2026-11-15, with a real route token in this shape): it matched the
  output `{"route": "<token>"}` and did not match the token with a letter glued to each end
  (`x<token>x`; that run went to `else`). A short word such as `fix` also matches `fixed` or a line of copy. Because
  the output can include user copy, input validation rejects the reserved prefix in copy,
  so copy can't force a branch; keep large copy out of the output a condition reads.
- **Design rule: a condition should only ever follow a code step.** The platform allows a
  condition directly after a loop (verified: it read the agents' aggregated output) or an
  agent step, but the prefix check covers user copy only, and an agent can emit any token
  (quoting look-alike copy, or under prompt injection).
- Conditions work inside loops (per-item routing).
- **Branch join works:** two paths into one step (condition branch -> Y -> J, and
  else -> J) imported and saved; each run executed J once. No need to duplicate a final
  step per branch.

## Code steps

- Python: `def handler(input: dict, ctx: dict) -> dict`. Stdlib plus the preinstalled
  `opal_tms_sdk`. **No network.** One file - no local imports. `ctx` has `input_dir` and
  `output_dir`. Default timeout 30 s; at most 300 s and return at most 256 KB (larger
  silently becomes null) **(docs)**.
- **Runtimes:** Python steps run **Python 3.12** with `opal_tms_sdk` 0.6.0
  (`tools.<name>(**params)`, also `tools.call(name, call_timeout=...)`). JavaScript steps
  (`"language": "javascript"`, `async function handler(input, ctx)`) run Node 24, CommonJS,
  with docx, pptxgenjs, react, react-dom, react-icons and sharp installed, and read
  attachments the same way, but **have no tool SDK**: no global, nothing on `ctx`, no
  installed package. **Consequence:** they cannot call custom or platform tools
  (`create_canvas`, `send_email`, ...). Any step that calls a tool must be Python.
- `from opal_tms_sdk import tools; tools.<name>(**params)` calls any registered tool
  (system or custom). Success is `{"response_type": "<mime>", "response": <body>}`.
- **The observed tool failures came back as data, not exceptions:**
  `{"response_type": "error", "response": {...}}`. Its keys vary: a custom tool's HTTP 500
  gave `message, details, error_type, status_code`; a failing system tool gave only
  `error_type` and `message`.
- **A 500 has also been seen inside a success envelope:** a CMP tool error reached a chat
  agent as `response_type: "application/json"` with `status_code: 500` inside `response`
  (seen via an agent, not reproduced in a code step).
- The SDK also defines exception classes (`ToolInvocationError`, `ToolUnavailableError`,
  `ToolValidationError`, `ProxyChannelError`) **(source)**, so a call can raise.
- **Pattern:** one helper per kind of tool that treats an error envelope, a non-dict
  result, any exception and an integer `status_code >= 400` in the body as failure, then
  checks the fields that tool documents (your own tool: its `status` token) - never the
  error's keys. A 100 s tool call completed normally (only the step's own timeout limits
  it).
- A step that fails to start (e.g. a syntax error) is diagnosed **to the end user in chat**,
  line number included - its own try/except cannot catch it. Parse and dry-run every step
  before deploying.

## Agents' `code_execute` sandbox
Python/Node/Bash VM with pandas, numpy, scipy, requests... but **no internet** (DNS fails).
Live external data must come through a custom tool.

## Platform tools - observed behaviour

| Tool | Behaviour |
|---|---|
| `send_email` in interactive chat | **Does not send**: renders a pre-filled compose card (`status: pending`); a human clicks Send. |
| `send_email` in a workflow (agent or code step) | **Sends immediately** after a guardrail check; `status: sent` plus a `message_id`. **Not restricted to org members** (an external address was accepted) - **docs differ**. Sent from Mark's no-reply address with a "generated by Mark" disclaimer. **Pattern:** a recipient allow-list enforced in code; count it as sent only on `status == "sent"`. |
| `create_canvas` | Versioned markdown artifact + `artifact_url`. From code needs `name`, `content`, `mime_type` (e.g. `text/markdown`). **Same name reuses the same canvas**, so make names unique per run. A ~1 MB markdown body was refused (`ToolValidationError`, no canvas made); the exact ceiling is unmeasured, so keep a report well under it. |
| `create_csv_canvas` | `title`, `csv_urls`: fetches a CSV server-side, returns its text in `response.data.content` byte-exact; leaves one private canvas per call (no delete in the UI). The way to read an emailed attachment. |
| `get_today` | Current date and time; callable from code. |

There is **no language-detection tool** in the platform (whole tool catalogue checked), and
no agent checks a text's source language. Use your own custom tool or a model judgment.

## Skills - how they actually attach

| Mechanism | Syntax / setup | Result |
|---|---|---|
| Keyword trigger in chat | Skill "When to use: keywords" | "Picked up a skill" shown; content injected. |
| Pin one skill in an agent prompt | `` {skill: `shortcut`} `` - **backticks required** | Injected as `## Organization Instructions`. |
| Plain braces | `{skill: some words}` | A **search query**, not a pin - may load nothing. |
| Auto by prompt | `{skill: **auto**}` in the prompt (= the "matching the prompt" checkbox) | **Not verified.** |
| Auto by tool | Skill "When to use: Tools: X" + `{skill: **auto-tool**}` in the agent prompt | Injected whenever the agent calls X; followed. |
| Prebuilt Content Translation | Its prompt has `{instruction: translate to [[language]]}` | A keyword-triggered org skill ("translate to German...") is injected as its term-base - steer a prebuilt agent without editing it. |

Being injected is not being obeyed: write skills as unconditional rules, not "if this
applies...".

## Mark's chat layer (what end users see)
- It **narrates runs**: step outputs and **code-step stdout/stderr** were paraphrased to the
  user (including an HTTP code printed to stderr). Raw tool payloads that stay inside an
  agent were not, but an agent may repeat them. **Pattern:** never print; user-safe
  outputs only; tool responses that carry no error detail.
- It **reads workflow internals** (step source code) and editorializes: it flagged
  hard-coded results, test switches and LLM-copied data, and offers its own advice (which
  can contradict your rules). Its narration can misattribute causes. The workflow's own
  final message must be authoritative; judge behaviour by the run log, not chat text.

## Prebuilt Directory agents
- Install from Directory -> Agents. Agents needing an absent product show a disabled Install.
- Many preinstalled agents are **inactive**: running one fails with HTTP 400 "Specialized
  agent is inactive" (UI flashes "agent execution failed"). Turn on Active -> Update; an
  "Auto-update is on" dialog warns Directory publishes overwrite local edits.
- Before using one as a workflow step, check `conversation_mode` and tools: avoid multi-turn
  agents and any using `ask_user_question` (workflow steps run single-turn).
- **Content Translation (`translation`)**: inputs `language` (required), `content`, `file`;
  tool `browse_web`; text output.
  - Back-translation to English is faithful: planted errors (wrong numbers, dates, claims,
    broken merge tags) were all kept and merge tags copied verbatim. du/Sie and tu/vous
    collapse in English, so check formality in the source language.
  - **Line labels survive:** `[L1] text` lines came back with their labels (de and ja), so
    one call per item can carry many lines and be split by label afterwards.
  - **Prompt leak:** its prompt says "Source text: `[[content]]` or `[[file]]` (at least one
    needed)". With no `file`, " or [[file]] (at least one needed)" was appended to the end
    of the output in some runs and not in others: in English when back-translating to
    English; translated (German, `[[file]]` kept) in forward translations into German.
    Other output languages were not observed. **Pattern:** the code step that consumes a
    back-translation strips only that exact English form at the end of the text (see
    `mark-code-step-patterns`), never a bare trailing "or", and a template-leftover check
    catches any variant.
  - It does not check the source language (nothing in the platform does).

## UI and operations gotchas
- The prompt editor swallows text when you type `/` (helper menu). Author agents as JSON and
  import (see the `mark-json-authoring` skill).
- Custom tool registry: Save spins and the request aborts, but the registry **is** created -
  reload. New functions need **Registries -> Actions -> Sync**.
- The org may be shared; agents are Shared by default. Use distinctive names and ids.
- Credits per run are in Agent Activity Logs; the balance may not be visible to your role.
  Costs seen: about 2-6 credits for a run of one to a few code steps; 18 credits for a
  2-item loop with Content Translation; 24 (orchestrator 12 + agents 12) for a 2-item loop
  with a custom agent.
- Run pages show each step's inputs, outputs, stdout/stderr, tool calls (agent ones) and
  condition MATCHED/NOT MATCHED. This is the source of truth.

## Verifying anything not listed here
1. Build a throwaway with a recognisable prefix (e.g. `ZZ-TEST`), smallest possible.
2. Don't confound the test: prompts and outputs must not ask for the behaviour you're
   measuring (e.g. don't ask an agent for "raw errors" when testing what chat shows).
3. Trigger it the way real users will (fresh chat thread for chat behaviour).
4. Read the **run log** (inputs, outputs, stderr), not chat narration.
5. Record the result with the date; delete the throwaway (check prefix and owner first).
