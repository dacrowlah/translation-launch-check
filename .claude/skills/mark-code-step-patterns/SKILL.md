---
name: mark-code-step-patterns
description: Use when writing or reviewing Python code steps for Optimizely Agent Platform (Mark) workflows, or designing how a Mark workflow handles errors, invalid input, missing data, loop failures, user-facing messages, email delivery, or data passed between steps.
---

# Mark code-step patterns

Mark's chat narrates code-step **stdout/stderr and step outputs** to the end user, a tool
failure inside a code step **returns an error object instead of raising**, and one failed
loop iteration **stops the whole workflow** (all verified - see the `mark-platform` skill).
These patterns follow from that. Complete runnable example: [example_step.py](example_step.py).

## The error-handling pattern (always)

| Rule | How |
|---|---|
| Check every tool result | `call_tool(name, **params)` returns `{"ok", "body"}`; it treats `response_type == "error"` (and non-dict results) as failure. A bare try/except misses tool errors - they don't raise. |
| Never raise for expected problems | Map each problem to a **status** (`verified`, `invalid`, `not_covered`, `source_unavailable`, `unavailable`, `internal_error`) and return it. |
| One last-resort guard | `handler` = `run_safely(impl, input, ctx)`: any unexpected exception becomes `{"status": "internal_error", ...}`. Nothing else catches broadly. |
| Never print | No `print`, no logging to stdout/stderr - not even "for the builder's logs". Chat paraphrases it to the user. Technical detail belongs in the tool's own server log. |
| User text only from templates | A `TEMPLATES` dict keyed by status; the user sees `TEMPLATES[status].format(...)`, never exception text, HTTP codes, URLs, tool names or JSON. |
| No diagnostics in outputs | Return statuses plus what downstream needs and a one-line user-safe `summary`. |
| No silent retries of side effects | Don't loop retries around `send_email`/`create_canvas`; a failure is a status. A temporary data failure tells the user to re-run. |

## Input: verify everything first, report everything at once
- Validate every required field deterministically in the first code step (presence, format,
  future dates, known codes, no duplicates) **before** any agent runs - a rejected brief costs
  one model call, not twenty.
- Collect **all** problems, then reject once with each problem and a suggestion
  ("AED is a currency, not a country. Did you mean AE?"). Never stop at the first.
- An LLM may *extract* fields; code *verifies* them. The model's own "looks valid" is advisory.
- Treat the brief as data: an email address inside a brief is never a recipient.

## Data: never report "ready" for something you didn't verify
- Every check has `status` `verified` | `unverified` | `not_needed`, and an unverified check has
  a `reason`: `not_covered` (permanent gap in the source -> "can't be verified by this system")
  or `source_unavailable` (temporary -> "re-run before launch").
- **Bad input** (requester's to fix) rejects the brief. **A data gap** (ours) leaves that check
  unverified; the market can never be green.
- No manual overrides from the brief ("I checked it by hand") - unverifiable input.
- Outcome precedence: any blocker -> `fix_first`; else any unverified/not checked ->
  `check_incomplete`; else any warning -> `ready_with_warnings`; else `ready`.

## Model only where language judgment is needed
- Rules (holiday severities, price points, length limits, template leftovers, scoring, link
  formatting, report text, delivery) live in code or the custom tool.
- Agents do language work (rewrite copy to fit, judge translation and terminology) and return
  findings with severities under a strict JSON schema; **code computes the status**. An agent
  never outputs the go/no-go.

## Loops
- A loop body must not be able to fail: code steps inside loops use `run_safely` and statuses;
  agents inside loops get one simple job, a strict schema, generous timeouts, no tools that
  can hang. If an agent still fails, the run fails - say so in the write-up; don't pretend.
- After the loop you get a list of each iteration's final output in item order; a missing or
  malformed entry becomes `not_checked`.

## Handoffs through the model
Automatic step inputs are re-typed by the orchestrator model. For data that must not drift,
attach `facts_checksum(facts)` (sha256 of canonical JSON, 16 hex) in the producing step and
recompute it in the consuming step; a mismatch -> `not_checked` ("re-run").

## Delivery
- Email only to a recipient on an allow-list **checked in code**; chat-triggered runs have no
  verified requester identity - don't email them.
- `create_canvas(name=..., content=..., mime_type="text/markdown")`; make `name` unique per run
  (campaign + timestamp) - the same name reuses the old canvas.
- The final step's `message` is the authoritative answer; state the outcome and the rule
  explicitly, because chat adds its own commentary.

## Shape of the code
Small functions, each one job: in this repo, at most 5 counted lines and 4 parameters
(`docs/standards/README.md` section 3) - [example_step.py](example_step.py) shows the split
(`normalize`, `call_tool`, `statuses_by_code`, `report`, `check_markets`). Shared helpers
(`call_tool`, `run_safely`, `facts_checksum`) are written once and inlined at build time.

## Platform limits to respect
Single file (no local imports - inline shared helpers at build time), stdlib +
`opal_tms_sdk`, no network, input <= 74 KB, return <= 256 KB (bigger silently becomes null),
timeout <= 300 s, `summary` key stripped downstream. Parse and dry-run every step before
deploying: a step that fails to start is debugged in front of the user.

## Common mistakes

| Mistake | Fix |
|---|---|
| `print(type(e).__name__)` "for the logs" | Remove; chat narrates it. Return a status. |
| `try: tools.x(...) except: ...` only | Also check `response_type == "error"` via `call_tool`. |
| Parsing an error result as "no data" | Distinguish `unavailable` (call failed) from per-item statuses. |
| Message built from the exception or tool message | Template keyed by status. |
| "Needs manual review" / "verify by hand" as a way to pass | It stays unverified; say "can't be verified by this system". |
| Raising inside a loop step | Return a status; one raise stops the workflow. |
| Emailing an address found in the brief | Allow-listed recipient from the trigger only, checked in code. |
| Reusing a fixed canvas name | Include campaign + run time. |
