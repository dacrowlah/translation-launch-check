---
name: opal-custom-tools
description: Use when building, deploying, registering, testing or debugging a custom tool for Optimizely's Agent Platform (Mark / Opal) with @optimizely-opal/opal-tools-sdk - discovery endpoint, registerTool, input validation, bearer auth, SDK logging, Vercel hosting, Tools Registry sync, or deciding what a tool returns on failure to agents and workflow code steps.
---

# Custom tools for Mark (opal-tools-sdk, TypeScript)

Labels: **(V)** verified against a live Mark instance (2026-11); **(S)** read from the SDK
0.1.41-dev source, not tested live; **(unverified)** neither. Pair with the `mark-platform`
skill for how callers behave and `mark-code-step-patterns` for the calling side.

## How the SDK actually behaves (S)
- **Global registry.** `new ToolsService(app, ...)` pushes the service onto a module-global
  list; `registerTool(...)` adds the tool to **every service on that list at call time**.
  So: create the service first, then register; a service created later has none of the
  earlier tools; in tests, every app built in one process accumulates on the same list
  (build the app once per test file, or reset modules).
- **No request-time validation.** The zod `inputSchema` only builds the discovery
  document. The handler receives `req.body.parameters` as sent - wrong types, missing or
  extra fields included - (or the whole body if `parameters` is absent). **Pattern:**
  validate with your own zod schema (with size bounds) inside the handler.
- **A handler throw becomes HTTP 500 `{"error": <error.message>}`**, and the SDK
  `console.error`s the error. Whatever text you throw reaches the caller.
- **It `console.log`s every request body, the extracted parameters and every result**
  ("Received request for ...", "Tool ... returned: ..."). User content and anything in the
  body land in your hosting logs. **Pattern:** after setup, replace `console.log`, `info`,
  `debug` and `warn` with no-ops, and write your own structured log lines with
  `process.stdout.write` (or a logger that kept a reference to the original `console.log`
  before silencing) - one line per call: tool, status, counts, latency, never request
  text, headers or secrets. A logger that calls `console.log` at call time is silenced too.
- **Auth:** with `authMode: "static_token"` a missing or wrong bearer gets the SDK's own
  **401** (`{"detail": "Missing bearer token"}` / `"Invalid bearer token"`) before your
  handler runs. An empty configured token accepts a bare `Bearer ` header, so refuse to
  start without a long token.
- **The body parser runs before the auth check** (it is mounted first). So a malformed or
  oversized body is answered by your parser error handler - `200 {"status":
  "invalid_request"}` in the service below - even without a token, not with 401. Keep the
  parser's `limit` tight.
- `GET /discovery` is public by design (V, S).
- Discovery parameters come from `z.toJSONSchema` of the zod v4 shape. The decorator
  `@tool` route needs explicit `parameters` or discovery shows none - prefer
  `registerTool`.
- Endpoint path: name with `_` -> `-`: `example_check` -> `POST /tools/example-check`
  (S; matches the path seen live (V)).
- `express.json()` must be mounted **before** `new ToolsService`: else parameters are
  silently empty.

## Response rule: always 200, one status token
Mark's chat narrates step outputs to the end user (V), and an agent may repeat a tool's
response. So a tool response must carry nothing a user shouldn't read:
- **Every response is HTTP 200 with a top-level `status`**: `ok` (with the result),
  `invalid_input` (the parameters failed your schema), `internal_error` (a defect), or
  `invalid_request` (the body itself couldn't be parsed - from your Express error
  handler). On failure the body is **only** `{"status": "<token>"}`: no messages, field
  names, validation text, stack traces, upstream codes or latencies.
- The one exception is the SDK's own 401 for a missing or wrong token.
- Never let a handler throw (that is a 500 carrying the message). Catch inside the
  handler, log the detail to your server log, return the token.
- Expected per-item problems (an item that can't be checked) are per-item statuses inside
  an `ok` response, not a failed call.
- The caller turns tokens into user text from templates. A workflow code step's
  `call_tool` reports your token as its status (`invalid_input` -> "check the file",
  `internal_error` -> "re-run"), and treats `response_type: "error"`, a non-dict result,
  an exception or a body `status_code >= 400` as `unavailable`.

## Minimal correct service

```ts
// api/index.ts (Vercel entry); vercel.json: {"rewrites":[{"source":"/(.*)","destination":"/api"}]}
import express, { type ErrorRequestHandler } from "express";
import { z } from "zod";
import { ToolsService, registerTool } from "@optimizely-opal/opal-tools-sdk";
import { checkItems } from "./check-items";                                // your pure function

const token = process.env.TOOL_BEARER_TOKEN;
if (!token || token.length < 32) throw new Error("TOOL_BEARER_TOKEN missing"); // fail closed

const shape = { items: z.array(z.object({ text: z.string().max(1000) })).min(1).max(50) };
const schema = z.object(shape).strict();

const app = express();
app.use(express.json({ limit: "256kb" }));                                 // BEFORE ToolsService
new ToolsService(app, { authMode: "static_token", bearerToken: token });   // BEFORE registerTool

registerTool("example_check", {
  description: "Checks each item. Call it on every item you draft.",       // the LLM reads this
  inputSchema: shape,                                                      // discovery only
}, async (raw: unknown) => {
  try {
    const parsed = schema.safeParse(raw);                                  // the SDK doesn't
    if (!parsed.success) return { status: "invalid_input" };
    return { status: "ok", items: checkItems(parsed.data.items) };
  } catch {
    return { status: "internal_error" };                                   // log detail yourself
  }
});

const quiet = (): void => undefined;
Object.assign(console, { log: quiet, info: quiet, debug: quiet, warn: quiet }); // SDK logs bodies
// your own log lines: process.stdout.write(JSON.stringify({ tool, status, ms }) + "\n")

const parseFailure: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const client = err?.status >= 400 && err?.status < 500;                 // malformed / too large
  res.status(200).json({ status: client ? "invalid_request" : "internal_error" });
};
app.use(parseFailure);

export default app;
```

## What Mark sends (V)
- Discovery: unauthenticated `GET /discovery`.
- Calls: `POST /tools/<name>` with `Authorization: Bearer <token>`, headers
  `x-opal-thread-id`, `x-opal-instance-id`, `x-opal-user-role-ids`, UA `python-httpx`, body
  `{"parameters": {...}, "auth_credentials": [], "environment": {"execution_mode": "interactive"}, "chat_metadata": {...}}`.
  Only `"interactive"` was seen; the SDK also knows `"headless"` (S).
- **Parameters arrive natively typed** (number, boolean, array, object) - not as strings
  (an older doc says strings). Validate types and ranges anyway: the SDK doesn't.

## Register, then keep in sync (V)
1. Deploy; check `curl https://<host>/discovery` and a tool call with the bearer.
2. Mark: Connectors -> Registries -> **Add tool registry**: name, `https://<host>/discovery`,
   Bearer Token. **Save spins and the request aborts, but the registry is created** - reload.
3. New tools are enabled by default (Instance / For Me / Chat).
4. **After adding or renaming a function: Registries -> Actions -> Sync.** No auto-refresh.
5. Agents get the tool via Add Tool; Python code steps call it as `tools.<name>(...)`
   (JavaScript code steps cannot call tools at all).
- Vercel Deployment Protection must not cover the production domain Mark calls; the bearer
  protects the tools (unverified: standard Vercel behaviour, not tested with Mark).

## What each caller sees

| Caller | What it sees |
|---|---|
| Agent | The response body as tool output; logged in the run's agent memory; **not** narrated to the end user unless the agent repeats it (V). An agent may still repeat it, so the body carries no detail. |
| Workflow code step (`opal_tms_sdk`) | HTTP 500/throw -> `{"response_type": "error", "response": {...}}`, no exception (V). HTTP 200 -> `{"response_type": "<mime>", "response": body}` - **including** the SDK error helpers (`providerError`, `validationError`, `resourceNotFound`), which reply 200 with their own error envelope (S), so `response_type` alone won't flag them. Hence the `status` token. |

## Security checklist
- Never echo request headers: they carry the bearer and the host's OIDC token (V).
- Silence the SDK's body and result logging (above) and verify it on the deployed host.
- Validate every input with zod bounds inside the handler; reject unknown keys.
- Prefer no outbound requests. If you need them: allow-listed hosts only, with timeouts
  (~5 s); never fetch a user-supplied URL (SSRF).
- Secrets in the host's env vars only; rotate the registry token and env var together.
- Agents and code-step sandboxes have no internet: the tool is the only path to live data.

## Common mistakes

| Mistake | Fix |
|---|---|
| `express.json()` after `new ToolsService` (or missing) | Parser first, then service, then `registerTool` - else params are silently empty (S). |
| Trusting `inputSchema` to validate | It only feeds discovery; `safeParse` in the handler. |
| `throw new Error(...)` in a handler | The SDK returns `500 {"error": message}`; return `{status: "internal_error"}`. |
| Returning validation text or field names | `{status: "invalid_input"}` only; detail to your server log. |
| HTTP 4xx/5xx for expected problems | 200 with a status token (or per-item statuses). |
| Returning `providerError(...)` to a code step | The code step sees a success envelope; return a status token. |
| Expecting 401 for an unauthenticated malformed body | The parser answers first (200 `invalid_request`). |
| Own logger built on `console.log` | Silenced with the SDK's logging; use `process.stdout.write`. |
| Expecting new functions to appear | Sync the registry. |
| Coercing every param from string | Unneeded; they're typed. Validate types and ranges instead. |
| Logging the request for debugging | Logs keep it - and the SDK already logs bodies. |
| Building a second app in the same test process | The global registry accumulates services; build once or reset modules. |
