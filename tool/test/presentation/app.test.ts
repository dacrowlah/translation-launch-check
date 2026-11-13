import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/main";
import type { LanguageDetector } from "../../src/domain/ports/language-detector";
import { aBody, listen, postTo } from "../support/http";
import { globalConsole } from "../support/console";
import { FakeClock } from "../support/clock";
import { FakeLanguageDetector } from "../support/language-detector";
import { RecordingLogger } from "../support/logger";
import { testRules } from "../support/rules";

// The SDK registers tools on every ToolsService ever created, so this file builds one app.
const TOKEN = "t".repeat(32);
const logger = new RecordingLogger();
const state = { detectorThrows: false };
const detector: LanguageDetector = {
  detect: (text, candidates) => {
    if (state.detectorThrows) throw new Error("secret detail");
    return new FakeLanguageDetector({}).detect(text) ?? candidates[0] ?? null;
  },
};
const cfg = () => ({
  token: TOKEN,
  rules: testRules(),
  clock: new FakeClock(),
  detector,
  logger,
});

const consoleCalls: unknown[][] = [];
const realLog = globalConsole().log;
let server: Server;
let base = "";

beforeAll(async () => {
  globalConsole().log = (...args) => consoleCalls.push(args); // createApp must replace this with a no-op
  ({ server, base } = await listen(createApp(cfg())));
});
afterAll(() => {
  globalConsole().log = realLog;
  server.close();
});

interface Json {
  functions: { name: string }[];
  rules: { version: string };
  locales: { checks: Record<string, string> }[];
}
const post = (path: string, body: unknown, token: string | null) => postTo(base, path, body, token);
const check = (body: unknown) => post("/tools/localization-check", body, TOKEN);

describe("the tool app", () => {
  it("discovery_is_public_and_lists_both_tools", async () => {
    const body = (await (await fetch(`${base}/discovery`)).json()) as Json;
    expect(body.functions.map((f) => f.name).sort()).toEqual([
      "copy_fit_check",
      "localization_check",
    ]);
  });

  it("tool_call_without_bearer_is_401", async () => {
    expect((await post("/tools/localization-check", aBody(), null)).status).toBe(401);
  });

  it("oversized_input_is_rejected_without_work", async () => {
    logger.events.length = 0;
    const res = await check(aBody({ lines: 51 }));
    expect([res.status, logger.events]).toEqual([400, []]);
  });

  it("returns_the_report_shape", async () => {
    const res = await check(aBody());
    const body = (await res.json()) as Json;
    expect([
      res.status,
      Object.keys(body.locales[0]?.checks ?? {}).length,
      body.rules.version,
    ]).toEqual([200, 24, "1.0"]);
  });

  it("copy_fit_check_measures_items", async () => {
    const items = [{ channel: "google_ads", field: "headline", text: "x".repeat(31) }];
    const res = await post("/tools/copy-fit-check", { parameters: { items } }, TOKEN);
    const [first] = (await res.json()) as { fits: boolean; over_by: number }[];
    expect([res.status, first?.fits, first?.over_by]).toEqual([200, false, 1]);
  });

  it("locales_missing_from_texts_are_a_validation_error", async () => {
    const body = aBody();
    body.parameters.locales = ["de-DE", "fr-FR"];
    expect((await check(body)).status).toBe(400);
  });

  it("logs_one_tool_call_with_counts_only", async () => {
    logger.events.length = 0;
    await check(aBody({ text: "ZZMARKER copy" }));
    expect(logger.events).toEqual([
      {
        event: "tool_call",
        tool: "localization_check",
        status: "ok",
        latency_ms: expect.any(Number),
        lines: 1,
        locales: 1,
      },
    ]);
  });

  it("never_writes_copy_to_stdout", async () => {
    const spy = vi.spyOn(process.stdout, "write");
    await check(aBody({ text: "ZZMARKER copy" }));
    const { calls } = spy.mock;
    const written = calls.join("");
    expect(written).not.toContain("ZZMARKER");
    spy.mockRestore();
    expect(consoleCalls).toEqual([]);
  });

  it("defect_returns_500_without_internals", async () => {
    state.detectorThrows = true;
    const res = await check(aBody());
    state.detectorThrows = false;
    const text = (await res.text()).toLowerCase();
    expect([res.status, text.includes("secret detail"), text.includes("authorization")]).toEqual([
      500,
      false,
      false,
    ]);
    expect(logger.events.map((e) => e.event)).toContain("defect");
  });

  it("malformed_json_gets_a_generic_400", async () => {
    const headers = { "content-type": "application/json", authorization: `Bearer ${TOKEN}` };
    const res = await fetch(`${base}/tools/copy-fit-check`, { method: "POST", headers, body: "{" });
    expect([res.status, await res.json()]).toEqual([400, { error: "invalid_request" }]);
  });

  it("refuses_to_start_without_a_long_token", () => {
    expect(() => createApp({ ...cfg(), token: "short" })).toThrow();
    expect(() => createApp({ ...cfg(), token: undefined })).toThrow();
  });
});
