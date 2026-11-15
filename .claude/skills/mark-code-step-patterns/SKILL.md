---
name: mark-code-step-patterns
description: Use when writing or reviewing Python code steps for Optimizely Agent Platform (Mark) workflows, or designing how a Mark workflow handles tool failures, invalid input, missing data, loop failures, large data between steps, email attachments, routing conditions, user-facing messages or email delivery.
---

# Mark code-step patterns

Why these patterns exist (verified 2026-11 unless marked; details in the `mark-platform`
skill):
- Mark's chat narrates code-step **stdout/stderr and step outputs** to the end user;
- the observed tool failures inside a code step **come back as data, not exceptions**
  (the SDK also defines exception classes, so a raise must be handled too);
- one failed loop iteration **stops the whole workflow**;
- a code step's input is **capped at 75,776 bytes** as Mark wraps it, and going over fails
  the run.

Complete runnable example: [example_step.py](example_step.py).

## The error-handling pattern (always)

| Rule | How |
|---|---|
| One helper for your own tool | `call_tool(tool, /, **params)` returns `{"ok", "status", "body"}`. `status` is your tool's own token (`ok`, `invalid_input`, `internal_error`, `invalid_request`), or `unavailable` for an error envelope (`response_type == "error"`), a non-dict result, any exception from the call, a body with an integer `status_code >= 400`, or a missing/unknown token. `ok` is `status == "ok"`. The tool name is positional-only so a tool parameter called `name` still works. |
| Small helpers for platform tools | The `status == "ok"` rule is for your own tool only. Each platform tool gets a helper that checks its own fields: `send_email` succeeded only if `status == "sent"` (`pending` means a compose card, nothing sent); `create_canvas` returns an `artifact_url` string; `create_csv_canvas` returns `data.content` as a string of the expected size. All of them also fail on the error envelope, a non-dict result, a raise or a `status_code >= 400` body. **Confirm these field paths in a code-step run log before relying on them:** `status` and `artifact_url` were seen in agent and chat results, `data.content` in a code step. A helper that reports failure for a canvas that was in fact created invites a re-run, and every run makes a new canvas (no delete), so don't retry canvases. |
| Never branch on the error's own keys | They differ between tools (verified 2026-11). |
| Never raise for expected problems | Map each problem to a **status** or **route** and return it. |
| One last-resort guard | `handler` = `run_safely(impl, input, ctx, fallback)`: any unexpected exception returns that step's `fallback` (a safe output with a templated message). Only two other kinds of helper catch broadly, on purpose: the tool-call helpers (any exception from the SDK call is a failure status) and the JSON helpers (canonical JSON, checksums, and the lenient encoding that looks for lone surrogates), which return `None` for anything they can't encode or compare (even a value whose own comparison or `__str__` raises). Everything else catches only the exceptions it expects (`OSError` around file access, `ValueError` when parsing, `UnicodeEncodeError` when encoding). |
| Never print | No `print`, no logging to stdout/stderr - not even "for the builder's logs". Chat paraphrases it to the user, and the step's return value itself travels on stdout. Technical detail belongs in the tool's own server log. |
| User text only from templates | A `TEXT` dict keyed by status; the user sees `TEXT[status].format(...)`, never exception text, HTTP codes, URLs, tool names or JSON. `invalid_input` / `invalid_request` get a "check the file against the template" text; `internal_error` / `unavailable` get "couldn't run the checks; your file wasn't the problem; re-run". |
| No diagnostics in outputs | Return what downstream needs, routing tokens and a one-line user-safe `summary`. |
| No silent retries of side effects | Don't loop retries around `send_email`/`create_canvas`/`create_csv_canvas`; a failure is a status. |

## Input: narrow inputs, verify everything first, report everything at once
- **Never pass the whole trigger object into a code step.** Chat pastes the attached file's
  text into `text_content` and email runs carry the HTML body and headers, so the whole
  trigger can exceed the 75,776-byte cap; the step then fails before your code runs. This
  is inferred from two verified facts (the cap, and that content travels in the trigger),
  not separately tested. Declare narrow Automatic inputs instead, e.g. `trigger_name`,
  `email_sender`, `email_attachments` ("trigger_context.email_payload.attachments,
  unchanged"), `webhook_payload`. A webhook payload that carries the data must itself fit
  the cap (see "Webhook size" below).
- **Narrow inputs are filled by the orchestrator model**, not copied from the raw trigger,
  so an input meant for another trigger type may be filled anyway (risk not reproduced;
  also not verified that the orchestrator resolves the `trigger_context.<path>` wording).
  Check each before use; anything that fails counts as absent:
  - **Email inputs:** use them only when `trigger_name` is `"Email"` (a recorded value;
    `"Chat"` and `"Scheduler"` are recorded too) via
    `from_trigger(input, "Email", "email_attachments")`, and only if each attachment has
    the recorded shape: `filename` ending in `.csv`, an integer `size_bytes` within the
    file cap, and a `url` of the form `gs://<bucket>/<object>` (fullmatch, no spaces,
    `?` or `#`). If you also declare `email_payload.file_urls`, require the url to be one
    of them.
  - **Webhook input:** the `trigger_name` value of a webhook run is **not recorded**
    (it may be the trigger's configured name), so don't gate on a literal. Gate on the
    package's own `package_sha256` verifying instead (required anyway: the payload passes
    through the model); see "Webhook package checksum" below for the recipe. The
    checksum proves the model didn't alter the payload, **not who sent it** - anyone can
    recompute it; the webhook's auth key is the sender gate.
  - **Which message:** a run with no verified package gets "no file arrived" when its
    `trigger_name` is a recorded non-webhook value (`"Chat"`, `"Scheduler"`, `"Email"`)
    or its payload is empty or not an object, whatever the payload's shape; only a
    non-empty payload on another run whose checksum fails gets "re-send the package".
  - **Webhook size:** the payload is itself a code-step input, so it must fit
    the 75,776-byte code-step input cap. Measure the **UTF-8 bytes of the JSON body as
    sent**. The relation to the cap comes from one ASCII measurement (Mark wrapped the
    value about 1.32x); how non-ASCII text expands in that wrapping is untested. So
    senders refuse any body above **50,000 bytes** (margin below the ~57 KB the ASCII
    ratio suggests). Over the cap the platform fails the run before your code starts (no
    templated message). The 60 KB / 200 KB caps below therefore only fire in the chat and
    email variants.
  - The `trigger_name` gate is hygiene, not a security boundary: the model fills it and
    the gated input alike. `email_sender` decides only whether a reply may go out (the
    allow-list); the trigger's own sender filter is the real gate on who can start a run.
- Validate every required field deterministically in the first code step (presence, format,
  known codes, no duplicates, size limits) **before** any agent runs - a rejected input
  costs no model calls. **Duplicate locales are rejected** there: two items with one
  locale would write the same run file, and the last writer would silently win.
- **Validate a strict package schema** and **reject unknown keys at every level**:
  - top level exactly `campaign`, `master_locale`, `locales`, `lines` (plus
    `package_sha256` on the webhook, removed once verified);
  - `campaign`: non-empty text, at most 100 characters;
  - `master_locale`: a locale code, **not** also listed in `locales`;
  - `locales`: locale codes, each listed once;
  - `lines`: at most 50, **counted before any per-line check**; each line exactly `id`,
    `channel`, `field` and `texts`. `id` starts with a letter (e.g. `L1`; integer-like
    ids such as `10` are rejected), ids are unique (checked with a set, in linear time);
    `channel` and `field` are non-empty text, at most 40 characters;
  - `texts`: keys are only the master and listed locale codes (locale codes start with a
    letter by the locale pattern), and every line has text for the master and **every**
    listed locale. **Visible text** means at least one character whose Unicode category
    is a letter (L*), number (N*), punctuation (P*) or symbol (S*), excluding
    blank-looking characters. The example's list is **examples, not exhaustive**
    (U+3164, U+115F, U+1160, U+FFA0, U+2800, U+FFFC, U+303F, U+2422, U+1361, U+A8F9,
    U+13441, U+13442, U+1144E, U+11C44); a font may still draw some other character as
    nothing. Anything else is **missing text** ("Line L3 has no fr-FR text").
  - **Control characters** (category Cc) are rejected in **every string field**
    (campaign, locale codes, line ids, channel, field, text cells), with one helper,
    except tab and line breaks. "Line break" means LF or CR (so CRLF) only; VT, FF, FS
    and NEL are rejected. U+2028/U+2029 are not Cc: they count as whitespace (allowed,
    but not visible text). Single-line fields (campaign, channel, field) refuse all line
    breaks too (LF, CR, U+2028, U+2029), because a step may echo them into an email
    subject or a canvas name.
  - **Data that isn't plain JSON** gets its own problem: NaN, Infinity, non-string keys
    or other non-JSON values -> "The data isn't valid JSON; re-export the file."
    (`invalid_data`). The "save it as UTF-8" message is only for text that can't be
    encoded (lone surrogates).

  **Check order** (the first problem found is reported): the data itself (first
  unencodable text, "save it as UTF-8"; then values that aren't plain JSON, "isn't valid
  JSON"), then `locales` and `lines` must be non-empty lists (else "nothing to check"),
  the reserved prefix, the top-level keys and campaign,
  the counts, locale codes and the master, duplicate locales, each line's keys, duplicate
  ids, each text cell, and last the size caps on the loop items. The example's single
  "line doesn't match the template" message stands in for one message per reason; a real
  step reports each problem with its own message and suggestion.

  With this schema no object key anywhere in the package is integer-like (see the sender
  recipe).
- **Three caps in that first step**, all configurable, each rejected with a "split the
  file" problem:
  - the number of loop items at most the loop's `max_iterations` (one constant shared
    with the workflow definition): "too many languages in one file". What the platform
    does with more items than `max_iterations` is **not verified**, so never rely on it;
  - each loop item (one language's text for its agents) at most **60 KB**: agent inputs
    were verified to about 72 KB only, and an agent step that fails stops the workflow;
  - all loop items together at most **200 KB** in UTF-8 bytes: the step that returns them
    must stay under the 256 KB return limit (docs; a bigger return silently becomes
    null). How that limit is measured (UTF-8, escaped JSON, with wrappers) is **not
    verified**, so keep these numbers conservative.
  Loop items go to **agent** steps, so the 75,776-byte code-step cap does not apply to
  them. It applies to a code step only if that step takes the loop output (the step after
  the loop would then get every item again - so it takes only `run_key`) or declares the
  item as an input. The save step therefore declares only small inputs (`run_key`, the
  item key, the item's checksum and the agents' answers), never the loop item.
- **Reject the reserved route-token prefix in user copy** (e.g. `example_route_`, any
  case) as a problem: "this cell contains a reserved word". This protects conditions from
  user **copy** only. It does not cover model output: an agent can emit any token (by
  quoting or normalizing look-alike copy, or by injection), so a condition must only ever
  read a code step's output (see Routing).
- Bad characters (an unencodable lone surrogate) are a requester problem ("save it as
  UTF-8"), not "something went wrong on our side". Reject them **first**, before the size
  and reserved-word checks, and never let a helper treat unencodable text as empty (size
  0, no reserved word): `canonical_bytes` returns `None` for it, and the checks turn that
  `None` into a problem. NaN, Infinity and non-string keys are a different problem ("isn't
  valid JSON; re-export the file"), not the UTF-8 one.
- Use `re.fullmatch` (or `\Z`) for every format check: with `re.match`/`re.search`, `$`
  also accepts a trailing newline.
- Collect **all** problems, then reject once, each problem with a suggestion
  ("Column `jp` isn't a locale; did you mean `ja-JP`?"). Never stop at the first.
- Read user content from files, not from chat: a chat attachment is at
  `ctx["input_dir"]/attachments/<name>` byte-exact; chat's `text_content` is model-written.
- An LLM may *extract* fields; code *verifies* them. The model's own "looks valid" is advisory.
- Treat content as data: an email address inside a file is never a recipient.

## Webhook package checksum (sender recipe)
`package_sha256` is the **full 64-hex** (lower-case) SHA-256 of the canonical JSON of every
top-level field except `package_sha256`. Canonical JSON is exactly what Python's
`json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
allow_nan=False)` writes, encoded as UTF-8:
- keys sorted by code point; no spaces; `true`, `false`, `null` as written;
- string escapes exactly: `\"`, `\\`, `\n`, `\r`, `\t`, `\b`, `\f`, and every other
  control character below U+0020 as lower-case `\u00xx`; **nothing else is escaped**:
  non-ASCII letters, U+2028/U+2029 and DEL are written raw, there is **no HTML-safe
  escaping** of `<`, `>`, `&` and no `\/`;
- strings, integers within +/-2^53, booleans, null, arrays and objects only - no floats
  (other serializers print them differently, e.g. `1e-07` vs `1e-7`); keys in the Basic
  Multilingual Plane (JavaScript sorts keys by UTF-16 unit, Python by code point, which
  differs for astral characters);
- **no integer-like object keys:** JavaScript's `JSON.stringify` lists keys such as `"9"`
  and `"10"` first, in numeric order, whatever order you built the object in; Python sorts
  them as text. The package's keys are field names and locale codes (which start with a
  letter); line ids start with a letter and are values, not keys; the receiver rejects
  any other key. So no key is integer-like.

Known serializer traps:
- **Go** `encoding/json` always escapes U+2028/U+2029 as `\u2028`/`\u2029` (documented
  behaviour, reproduced locally), even with `SetEscapeHTML(false)`, and `Encoder.Encode`
  appends a newline. Post-process the output back to the raw characters and drop the
  newline, or write a custom encoder. The fixture catches this trap (it holds U+2028).
- **JavaScript** writes a lone surrogate as `\ud800` where Python refuses to encode it, so
  such a package can never verify. The fixture can't catch this one (it has no lone
  surrogate), so it must be caught in the sender: sender authors reject lone surrogates
  before sending (otherwise the receiver can't compute the checksum and answers
  "re-send").

Use one sender implementation and test it against this fixture before it sends anything.
The fixture is a complete webhook payload in the package shape the example step reads
(`campaign`, `master_locale`, `locales`, `lines`); a conforming sender reproduces its
`package_sha256`, and the example step accepts it end to end. It holds `<`, `>`, `&`, a
newline, U+2028 and non-ASCII letters, so an HTML-escaping or ASCII-escaping serializer
fails it. JSON text, escapes as written:

```json
{"campaign": "Example", "master_locale": "en-US", "locales": ["de-DE"],
 "lines": [{"id": "L1", "channel": "email", "field": "body",
            "texts": {"en-US": "Save 20% <b>now</b> & more\nDetails",
                      "de-DE": "Jetzt 20 % sparen <b>jetzt</b> & mehr\u2028Gr\u00fc\u00dfe"}}],
 "package_sha256": "0e294581c65d6bfe06b3f223cfe5555f3d48335660934173779c10a804cb6f75"}
```

Canonical form of every field except `package_sha256`: 235 UTF-8 bytes (`<U+2028>`,
`<U+00FC>`, `<U+00DF>` stand for the raw characters; `\n` is the two-character escape):

```
{"campaign":"Example","lines":[{"channel":"email","field":"body","id":"L1","texts":{"de-DE":"Jetzt 20 % sparen <b>jetzt</b> & mehr<U+2028>Gr<U+00FC><U+00DF>e","en-US":"Save 20% <b>now</b> & more\nDetails"}}],"locales":["de-DE"],"master_locale":"en-US"}
```

SHA-256: `0e294581c65d6bfe06b3f223cfe5555f3d48335660934173779c10a804cb6f75`. The checksum
proves integrity, not who sent the package (see Input).

## Email attachments (verified 2026-11)
An emailed file does not reach `input_dir`, the trigger holds only a storage link, code
steps have no network, and step inputs can't be files. Pattern (`read_csv_attachment` in
the example):
1. Use the attachments only when `trigger_name` is `"Email"`. Require exactly one; check
   before calling that its `filename` ends in `.csv`, its `size_bytes` is an integer
   within your limit and its `url` fully matches `gs://<bucket>/<object>`. That check is
   shape-only: bucket names are platform-internal and not recorded, so it cannot tell the
   trigger's own object from another. Every call leaves one private CSV canvas in the
   workflow owner's Artifacts, with no delete in the UI, so never call it for a file you
   will reject, and call it once per run.
2. `tools.create_csv_canvas(title=..., csv_urls=[attachment["url"]])`; take the text from
   `response["data"]["content"]`.
3. Check `len(content.encode("utf-8")) == size_bytes` (bytes, not characters: localized
   files are full of non-ASCII letters). The text is returned byte-exact, CRLF
   kept (verified 2026-11).

## Large data: a run folder, small references (verified 2026-11)
- Files under `/workspace` persist between the steps of one run. The first step creates
  `/workspace/<project>/<run_key>/` with a random `run_key` (`secrets.token_hex(8)`).
- Write each file as `{data, checksum}`; reading has two layers:
  1. **Self-integrity, never skipped:** `read_run_file(run_key, name)` always recomputes
     the checksum of the stored data and compares it with the stored checksum; a missing,
     unreadable, malformed or changed file is `not_checked` (re-run), never clean, and a
     malformed run key or file name is `invalid_path`. It returns a fresh
     `{status, data, checksum}` dict on every call (never a shared one a caller could
     change).
  2. **Binding, where a checksum was handed over, fail closed:** the caller compares a
     field with the value it was given, and that value must be a non-empty string (a
     missing or null value is `not_checked`, never a match). The report: its stored
     checksum must equal the handed-over `report_checksum` (`read_report`). Each review
     file: its data must be an object whose `checksum` field (the echo) equals that
     locale's checksum in the verified report (`read_review`); non-object data or a
     missing echo is `not_checked`. A failed layer 1 is passed through unchanged, so
     `invalid_path` stays distinct from `not_checked`. So the step after the loop needs
     only `run_key` and
     `report_checksum`, and the expected locale list comes from the report too (a save
     step that fell back leaves a missing file, which is `not_checked`).
- **The locale checksum** (`locale_checksum`) is `facts_checksum` of the locale code
  together with that locale's lines and rule findings, so two locales with identical text
  still get different values and their review files can't be swapped unnoticed.
- `canonical_json` and `facts_checksum` never raise: anything that isn't finite,
  string-keyed, encodable JSON (including data nested too deeply to serialize) gives
  `None`. `write_run_file` refuses data that doesn't survive a JSON round trip unchanged
  (non-string keys, tuples, NaN or infinite numbers, a lone surrogate, too deep) with
  `invalid_data`
  and touches nothing: such data would never verify on read, and `Infinity` isn't JSON.
  It builds the stored bytes (`{data, checksum}`) before it touches the disk, and checks
  that wrapper, not only the data: the wrapper is one level deeper, so data at the
  serializer's depth limit can encode while its file can't. Checking the data alone
  creates the folder and then raises.
- **Validate both path parts** in `write_run_file` / `read_run_file` with `fullmatch`:
  `run_key` is `[0-9a-f]{16}`; the file name is `[a-z0-9_-]+(/<locale>)?\.json` (or an
  explicit allow-list), where `<locale>` is
  `[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?` (en-US, es-419, zh-Hant-TW,
  fil-PH). It rejects BCP-47 variants and extensions (`ca-ES-valencia`, `de-CH-1996`,
  `en-US-u-...`); when your product may use those, check names against the product's own
  locale list (an explicit allow-list) instead.
- Both the run key and the file name reach later steps through the model; anything that
  fails the check returns a failure status and touches nothing. Item keys used in names
  (e.g. a locale) are untrusted too: build `reviews/<locale>.json` only from a locale that
  passed the check.
- Test the returned `status`, not `data`: stored data may itself be null.
- Step outputs carry only routes, the `run_key`, checksums and each agent's own answer.
- Whether `/workspace` is emptied between runs is not verified. The folder holds user
  copy; if retention matters, the final step deletes it (`shutil.rmtree` on the validated
  path) after the report is delivered.

## Data: never report "ready" for something you didn't verify
- Every check reports `verified` or `not_applicable`; a check that didn't run never looks
  like a pass.
- **Bad input** (the requester's to fix) rejects the run with every problem listed. **A
  data gap or failed step** (ours) marks the affected item `check_incomplete` ("re-run").
- Outcome precedence: any blocker -> `fix_first`; else anything not checked ->
  `check_incomplete`; else any warning -> `ready_with_warnings`; else `ready`.

## Model only where language judgment is needed
- Rules (counts, limits, formats, template leftovers, scoring, routing, report text,
  delivery) live in code or the custom tool.
- Agents do language work and return findings with severities under a strict JSON schema;
  **code computes the verdict**. An agent never outputs the go/no-go.

## Loops
- A loop body must not be able to fail: code steps inside loops use `run_safely` with a
  fallback; agents inside loops get one simple job, a strict schema, generous timeouts, no
  tools that can hang, and bounded inputs. If an agent still fails, the run fails - say so;
  don't pretend.
- **End each iteration with a small "save" code step** (verified 2026-11). A step after
  the loop that takes the loop output receives every iteration's full record, including
  the whole loop item, which can exceed the input cap; a code step at the end of the body
  receives only its declared inputs. The save step declares `run_key`, the item key, the
  item's `checksum` and the agents' answers (nothing else), validates the key, checks the
  agent echoed the same checksum, writes `reviews/<key>.json` with that checksum inside
  (field `checksum`), and never fails (its fallback writes nothing). The step after the
  loop takes only `run_key` and `report_checksum` and binds each review through the
  report (above). Parallel iterations each write their own file, so they never share one.
- A code step may also be the **first** step in a loop body (verified 2026-11, e.g. to
  load each chunk from the run folder).
- Iterations ran **mostly one after another despite `parallel: true`** (verified 2026-11:
  about 25 s per iteration of two code steps), so budget run time per item.
- Agents echo the item key and checksum they were given; the reader matches by key and
  checks the echo.
- **Strip Content Translation's prompt leak in the save step** (`strip_translation_leak`
  and `leak_free_text` in the example). With no `file` input it may append
  "or [[file]] (at least one needed)" to the end of its output (seen in some runs, absent
  in others). The rule, in linear time (`rstrip()`, `endswith`, slice):
  - ignoring trailing whitespace, remove `[[file]] (at least one needed)` only if the text
    ends with it, then the one word "or" before it if that "or" follows any whitespace
    (space, several spaces, newline, NBSP) or is the whole remaining text;
  - nothing else: a real "or" before that one survives (`"Buy or or " + leak` ->
    `"Buy or"`); a bare trailing "or" with no leak after it is never touched;
  - a real "or" that is the last word immediately before the marker cannot be told from
    the leak's own and is removed with it (`"Choose A or " + leak` -> `"Choose A"`); the
    template-leftover check does not catch this, so accept it as a known limit;
  - a result that is `None`, empty or whitespace-only means the agent returned nothing
    usable: that locale is `check_incomplete` (`leak_free_text` returns `None`).

  **No regex with an unanchored `\s*` run on model output.** The earlier
  `re.sub(r"(?:\s+or)?\s*\[\[file\]\] ...\s*\Z", ...)` is quadratic on long whitespace
  (0.2-0.4 s at 8,000 spaces in local runs, growing with the square of the length), and a
  step **timeout is not an exception**: `run_safely` can't catch it, and a timed-out save
  step stops the loop.

  Back-translation here is always into English, so only the English form is handled;
  forms in other output languages were not observed in back-translation (a German form
  appeared in forward translations into German). The template-leftover check catches
  anything else; don't touch `{{...}}` merge tags.

## Handoffs through the model
Automatic inputs are wired by the orchestrator model. Upstream values are passed by
reference (verified 2026-11), but the model picks what to wire. For data that must not drift,
attach `facts_checksum(value)` in the producing step and recompute it in the consuming
step; a mismatch -> `check_incomplete` ("re-run"). One recipe per purpose, both over the
same canonical JSON (`json.dumps(sort_keys=True, separators=(",", ":"),
ensure_ascii=False, allow_nan=False)`, UTF-8):
- **internal handoffs** (run files, locale checksums, `report_checksum`): `facts_checksum`
  = the first **16 hex** of its SHA-256;
- **the webhook package** (`package_sha256`): the **full 64 hex**, made by the sender
  (recipe and fixture: "Webhook package checksum" above).

## Routing
A condition matches the previous step's whole output text, user copy included. So:
- Emit a **route token with a reserved prefix** as a value (the examples use
  `example_route_`: `example_route_check`, `example_route_needs_info`,
  `example_route_fix`, `example_route_report`; pick your own project prefix) and match it
  with a whole-token `regex` (`\bexample_route_fix\b`). Short words like `fix` also match
  `fixed`, `fix_first` or a line of copy.
- **Design rule: a condition should only ever follow a code step.** The platform allows
  a condition directly after a loop (verified: it read the agents' aggregated output) or
  an agent step, but don't build one there: an agent can emit any token, by quoting or
  normalizing look-alike copy or under prompt injection. A code step in between emits the
  route token from code-only facts. Both examples place a code step before each condition
  for this reason.
- The prefix is public, so a requester could type a token into copy. The first step
  rejects the prefix in user copy (above); that, not the token's rarity, is what protects
  conditions from copy. It does not protect against model output - the rule above does.
- Keep large user copy out of the output a condition reads where you can; the run-folder
  pattern does that. Where loop items must carry text in that output (the first step's
  output), the prefix check covers it.
- `regex` conditions were verified (2026-11, `route.{0,4}fix`, evaluated without a model);
  the `\b...\b` whole-token form follows standard regex and was not tested separately.
- Two branches may end at the same step (branch join verified 2026-11).

## Delivery
- Email only to a recipient on an allow-list **checked in code**; chat-triggered runs have
  no verified requester identity - don't email them. Count the email as sent only on
  `status == "sent"`.
- `create_canvas(name=..., content=..., mime_type="text/markdown")`; the same name reuses
  the old canvas, so make `name` unique per run with the random `run_key` (a timestamp
  alone can collide between concurrent runs). If the name shows user text (a campaign
  name), strip and truncate it. Escape Markdown table characters in user content.
- The final step's `message` is the authoritative answer; state the outcome and the rule
  explicitly, because chat adds its own commentary.

## Shape of the code
Small functions, each one job: in this repo at most 5 counted lines per function body and
4 parameters (`docs/standards/README.md` section 3). [example_step.py](example_step.py)
shows the split. Shared helpers (`call_tool`, platform-tool helpers, `run_safely`,
`canonical_json`, `facts_checksum`, run-folder read/write) are written once and inlined
into each step at build time. Tests replace `opal_tms_sdk` with an in-memory fake on
`sys.path`.

## Platform limits to respect
Python 3.12; single file (no local imports - inline shared helpers at build time); stdlib +
`opal_tms_sdk`; no network; input <= 75,776 bytes as wrapped by Mark (about 1.32x your
JSON in one ASCII measurement); return <= 256 KB (docs: bigger silently becomes null);
timeout default 30 s (docs: at most 300 s, not re-verified); `summary` key stripped
downstream. JavaScript steps exist but cannot call tools. Agent input limits: see
`mark-platform`. Parse and dry-run every step before deploying: a step that fails to start
is debugged in front of the user.

## Common mistakes

| Mistake | Fix |
|---|---|
| `print(...)` "for the logs" | Remove; chat narrates it. Return a status. |
| `try: tools.x(...) except: ...` only | Use `call_tool`: exception, envelope, type, `status_code` and `status` checks. |
| One message for every tool failure | Template per status: the requester's problem vs ours. |
| `call_tool` for `send_email` / `create_canvas` | A platform-tool helper that checks that tool's fields. |
| Reading `error_type` / `status_code` text from a tool error | Keys vary by tool; treat any failure the same way. |
| Message built from the exception or tool message | Template keyed by status. |
| Whole trigger object as one input | Narrow inputs: `trigger_name`, `email_attachments`, ... |
| Passing a whole file or report between code steps | Run folder + `run_key` + checksum. |
| Taking the loop's output in the step after a loop | Save step at the end of each iteration; read the files. |
| Raising inside a loop step | Return a status; one raise stops the workflow. |
| Path built from a model-supplied key or name unchecked | Validate `run_key` and file name; touch nothing on failure. |
| `contains "fix"` or `route.*fix` on output that holds copy | Reserved-prefix token, whole-token regex, prefix rejected in copy. |
| Using an email input without checking `trigger_name` and the attachment shape | Gate on `"Email"` and the recorded shape; otherwise treat it as absent. |
| Only a per-item size cap | Also cap the sum of loop items (the 256 KB return limit) and their count. |
| Stripping a trailing "or" or the leak on any line | Only the exact observed leak, at the end of the text. |
| A backtracking regex (`\s*...\Z`) over model output | Linear string operations (`rstrip`, `endswith`). |
| A condition directly after an agent or a loop | A code step in between emits the route token. |
| Gating a webhook input on `trigger_name == "Webhook"` | The value is unrecorded; gate on the package checksum. |
| No item-count check | Reject more items than the loop's `max_iterations`. |
| Checking only the data before writing its `{data, checksum}` file | Build the stored bytes first (the wrapper is one level deeper); `invalid_data` when they can't be encoded, before touching the disk. |
| Reading a run file without checking its own checksum | `read_run_file` always checks it; then bind via `read_report` / `read_review`. |
| A sender computing `package_sha256` with 16 hex or a different serializer | Full 64 hex; reproduce the canonical JSON and test against the fixture. |
| Duplicate locales in one file | Rejected in the first step; one file per locale. |
| Checking only that a text cell exists | Text needs a letter, number, punctuation or symbol (not a blank-looking character). |
| Checking control characters only in text cells | One helper for every string field; tab, LF and CR only; single-line fields refuse LF, CR, U+2028, U+2029 too. |
| One "unreadable" message for every bad value | UTF-8 message for lone surrogates; "isn't valid JSON" for NaN, Infinity, non-string keys. |
| Treating unencodable text as empty in size or reserved checks | Reject it first ("save it as UTF-8"). |
| Accepting unknown keys in the package | Strict schema: reject unknown keys at every level. |
| Per-line checks before the line cap, or duplicate ids by list scan | Cap lines first; find duplicates with a set. |
| Numeric line ids (`1`, `10`) | Ids start with a letter; integer-like keys sort differently in JavaScript. |
| Trusting `SetEscapeHTML(false)` in a Go sender | Go still escapes U+2028/U+2029; post-process and test against the fixture. |
| `re.match(r"^...$")` for a format check | `re.fullmatch` (or `\Z`). |
| `len(text) == size_bytes` | `len(text.encode("utf-8")) == size_bytes`. |
| Calling `create_csv_canvas` before checking the attachment | Check name, size, `url` and count first; each call leaves a canvas. |
| Expecting an emailed file in `input_dir` | `create_csv_canvas` with the attachment's `url`. |
| Calling a tool from a JavaScript step | Python only; JS steps have no tool SDK. |
| Emailing an address found in the content | Allow-listed recipient from the trigger only, checked in code. |
| Canvas name from subject + time | Include the random `run_key`. |
