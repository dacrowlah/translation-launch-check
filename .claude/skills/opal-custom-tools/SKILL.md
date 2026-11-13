---
name: opal-custom-tools
description: Use when building, deploying, registering or debugging a custom tool for Optimizely's Agent Platform (Mark / Opal) with @optimizely-opal/opal-tools-sdk - discovery endpoint, registerTool, bearer auth, Vercel hosting, Tools Registry sync, or deciding how a tool should report failures to agents and workflow code steps.
---

# Custom tools for Mark (opal-tools-sdk, TypeScript)

Facts marked (V) were verified against a live Mark instance (2026-11); (S) were read from
the SDK 0.1.41-dev source. Pair with the `mark-platform` skill for how callers behave.

## Minimal correct service

```ts
// api/index.ts (Vercel entry); vercel.json: {"rewrites":[{"source":"/(.*)","destination":"/api"}]}
import express from "express";
import { z } from "zod/v4";
import { ToolsService, registerTool } from "@optimizely-opal/opal-tools-sdk";

const token = process.env.TOOL_BEARER_TOKEN;
if (!token || token.length < 32) throw new Error("TOOL_BEARER_TOKEN missing"); // fail closed (S: empty token weakens the check)

const app = express();
app.use(express.json({ limit: "100kb" }));                                 // BEFORE ToolsService (S)
new ToolsService(app, { authMode: "static_token", bearerToken: token });   // BEFORE registerTool (S)

registerTool("holiday_check", {
  description: "Public holidays for a country and year. Call when a launch date must be checked.",
  inputSchema: { country_code: z.string().describe("ISO 3166-1 alpha-2, e.g. DE"), year: z.number().describe("e.g. 2027") },
}, async ({ country_code, year }) => checkHolidays(country_code, year));    // returns statuses, never throws

export default app;
```
- `registerTool` builds discovery parameters from the zod schema (S). The decorator `@tool`
  route needs explicit `parameters` or discovery shows none (S) - prefer `registerTool`.
- Endpoint path: name with `_` -> `-`: `holiday_check` -> `POST /tools/holiday-check` (V).
- `GET /discovery` is public by design; every other route needs the bearer (V, S).

## What Mark sends (V)
- Discovery: unauthenticated `GET /discovery`.
- Calls: `POST /tools/<name>` with `Authorization: Bearer <token>`, headers
  `x-opal-thread-id`, `x-opal-instance-id`, `x-opal-user-role-ids`, UA `python-httpx`, body
  `{"parameters": {...}, "auth_credentials": [], "environment": {"execution_mode": "interactive"|"headless"}, "chat_metadata": {...}}`.
- **Parameters arrive natively typed** (number, boolean, array, object) - not as strings (V;
  an older OCP doc says strings).

## Register, then keep in sync (V)
1. Deploy; check `curl https://<host>/discovery` and a tool call with the bearer.
2. Mark: Connectors -> Registries -> **Add tool registry**: name, `https://<host>/discovery`,
   Bearer Token. **Save spins and the request aborts, but the registry is created** - reload.
3. New tools are enabled by default (Instance / For Me / Chat).
4. **After adding or renaming a function: Registries -> Actions -> Sync.** No auto-refresh.
5. Agents get the tool via Add Tool; code steps call it as `tools.<name>(...)`.
- Vercel Deployment Protection must not cover the production domain Mark calls (the bearer
  protects the tools).

## How to report problems (callers differ)

| Caller | What it sees |
|---|---|
| Agent | The response body as tool output; logged in the run's agent memory; **not** narrated to the end user unless the agent repeats it (V). |
| Workflow code step (`opal_tms_sdk`) | HTTP 500/throw -> `{"response_type": "error", "response": {...}}`, no exception (V). HTTP 200 -> `{"response_type": "<mime>", "response": body}` - **including** the SDK error helpers (`providerError`, `validationError`, `resourceNotFound`), which reply 200 with an error envelope (S), so `response_type` alone won't flag them. |

Pattern that works for both: **expected problems are per-item statuses in a normal 200
response** (`{"markets": [{"country_code": "DE", "status": "source_unavailable"}]}`); no
upstream codes, latencies, URLs or stack traces in the body. Throw/500 only for genuine
defects. User wording is the caller's job (templates keyed by status). Upstream detail goes
to your own server log as one structured line.

## Security checklist
- Never echo request headers - they carry the bearer and Vercel's OIDC token (a probe that
  echoed headers leaked them; Mark flagged it) (V).
- **The SDK `console.log`s full request bodies and results** (S, and seen in Vercel logs) -
  campaign copy and any credentials land in logs. Silence or wrap that logging.
- Outbound requests only to allow-listed hosts, with timeouts (~5 s); never fetch a
  user-supplied URL (SSRF). Validate inputs with zod bounds before use in upstream URLs.
- Secrets in Vercel env vars only; rotate the registry token and env var together.
- Agents and code-step sandboxes have no internet: the tool is the only path to live data.

## Common mistakes

| Mistake | Fix |
|---|---|
| `express.json()` after `new ToolsService` (or missing) | Parser first, then service, then `registerTool` - else params are silently empty (S). |
| Expecting new functions to appear | Sync the registry. |
| Coercing every param from string | Unneeded; they're typed. Validate ranges instead. |
| Returning `providerError(...)` to a code step | The code step sees a success envelope; return statuses. |
| Logging the request for debugging | Logs keep it - and the SDK already logs bodies. |
| `throw new Error(upstream message)` | The SDK returns `500 {"error": message}` - internal text reaches callers. |
