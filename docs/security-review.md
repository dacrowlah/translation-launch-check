# Security review

A review of both halves of the Translation Launch Check before the repository was published:
the tool (`tool/`, the TypeScript service on Vercel) and the Mark side (`mark/`, the workflow,
its code steps and agents). The binding security rules are in
[standards/TOOL.md](standards/TOOL.md) section 3 and [standards/MARK.md](standards/MARK.md)
section 7; accepted gaps are in [contract/KNOWN_LIMITATIONS.md](contract/KNOWN_LIMITATIONS.md).

## Summary

- **No Critical or Important code vulnerabilities** were found.
- **One Important design note.** The workflow reuses Optimizely's Content Translation agent
  for the back-translation, and that agent has the platform tool `browse_web`. Untrusted
  copy reaches it. The impact is bounded: its answer feeds only the review of one language's
  lines, and every verdict is computed in code. It is documented in
  [KNOWN_LIMITATIONS](contract/KNOWN_LIMITATIONS.md).

## Checklist results

All hold unless noted.

### Tool (`tool/`)

- **Auth.** Every tool route requires the bearer token. The SDK compares it in constant time
  (`crypto.timingSafeEqual`). The service refuses to start unless `TOOL_BEARER_TOKEN` is at
  least 32 characters with no surrounding whitespace.
- **Routes.** `/discovery` is public by design: Mark fetches it without auth. Every route
  other than discovery and the two tools gets a 404 before the SDK sees it, so no name or
  path is echoed.
- **No echo.** Responses never echo a header or a secret.
- **Input.** Every request is validated with zod, with size bounds on lines, locales and
  cells. The request body is limited to 256 KB.
- **Errors.** Responses carry status tokens only. Handlers never throw; a malformed or
  oversized body gets `invalid_request`, a defect gets `internal_error`.
- **Logs.** The SDK's console logging is silenced. Log events carry statuses and timings,
  never copy.
- **No outbound requests.** The service fetches nothing. The SDK's async-callback path is
  unused: the tools are never registered in async mode, and a test proves the callback
  never fires.
- **Layers.** No Node built-ins in the domain or application layers (enforced by the
  architecture test).
- **Dependencies** are pinned to exact versions. `pnpm audit`: production dependencies are
  clean; development dependencies have 1 moderate finding (minimatch, through eslint),
  which is not reachable at runtime.

### Mark side (`mark/`)

- **Input bounds.** Size, row, language and cell limits are checked before any agent runs.
  Cells are treated as text, never evaluated.
- **CSV parsing is strict** (fixed in this review).
- **Display.** Untrusted text (copy, the campaign name, the tool's and the agents' text) is
  escaped for Markdown in the chat reply and the canvas, including `|`, so it can't add
  links, images or table cells.
- **Email.** The report email is sent as `text/plain` (verified in the instance), so
  untrusted text in it stays inert.
- **Webhook.**
  - The trigger requires its auth key.
  - A package counts only if its SHA-256 checksum, over canonical JSON, verifies.
  - Results are never returned to the webhook caller.
- **Recipients.** The email recipient comes only from the private config, never from the
  file. It is checked against an allow-list in code twice: in the report step and again
  inside the send helper.
- **Credentials.** Code steps hold no credentials. Secrets live only in the gitignored
  `mark/local.config.json` and the Vercel environment. Build output (`mark/dist/`) is never
  committed.
- **Verdicts** are computed in code. A model's answer can add findings but never sets a
  verdict.
- **Routing.** Copy can't steer the workflow's conditions:
  - the route-token prefix is refused in copy and in the campaign name;
  - the prefix is defused in model text;
  - invisible and control characters are stripped before that check;
  - conditions match exact regexes.

### Checks run

- **ReDoS.** The regexes that run over untrusted copy are linear; scaling tests pin it.
- **Prototype pollution.** zod strips unknown keys, and locale keys are checked against a
  regex.
- **Path traversal.** Run keys are random, and file paths are checked against a regex.

## Fixed in this review

- Strict CSV parsing.
- A guard against spreadsheet formula injection in the corrected file: a fix that starts with
  `=`, `+`, `-` or `@`, or a tab or carriage return (also after leading whitespace or
  invisible characters), is not applied unless the original cell starts the same way.
- A test that the SDK's async callback never fires.
- Docs qualified about Content Translation's `browse_web`.
- KNOWN_LIMITATIONS entries for prompt injection that hides model-judged findings.

## Process

- Every platform behaviour the security relies on was verified in a live instance first.
- The tool bearer token and the webhook auth key were rotated before publishing; the old
  values are refused.
- The git history was scanned for secrets and private data before publishing.
