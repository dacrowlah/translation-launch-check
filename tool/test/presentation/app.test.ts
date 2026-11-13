import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
const state = { detectorThrows: false, detectCalls: 0 };
const detector: LanguageDetector = {
  detect: (text, candidates) => {
    state.detectCalls += 1;
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
const INVALID = [500, { error: "invalid_input" }];
const outcome = async (res: Response) => [res.status, await res.json()];
const withParams = (patch: Record<string, unknown>) => {
  const body = aBody();
  return { ...body, parameters: { ...body.parameters, ...patch } };
};
const withTexts = (texts: Record<string, string>) => ({
  lines: [{ id: "L0", channel: "email", field: "body", texts }],
});
const BASE_TEXTS = { "en-US": "a", "de-DE": "b" };
const BAD_PACKAGES: [string, Record<string, unknown>][] = [
  ["a texts key outside master and locales", withTexts({ ...BASE_TEXTS, "fr-FR": "c" })],
  ["a texts key that is not a locale", withTexts({ ...BASE_TEXTS, x: "c" })],
  ["a duplicate target locale", { locales: ["de-DE", "de-DE"] }],
  ["the master as a target", { locales: ["en-US"] }],
  ["a locale missing from texts", { locales: ["de-DE", "fr-FR"] }],
];
const INVALID_EVENT = {
  event: "tool_call",
  tool: "localization_check",
  status: "invalid_input",
  latency_ms: expect.any(Number),
  lines: 0,
  locales: 0,
};
const post = (path: string, body: unknown, token: string | null) => postTo(base, path, body, token);
const check = (body: unknown) => post("/tools/localization-check", body, TOKEN);
afterEach(() => {
  vi.restoreAllMocks();
  state.detectorThrows = false;
});

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

  it("oversized_input_is_invalid_input_and_does_no_work", async () => {
    logger.events.length = 0;
    state.detectCalls = 0;
    const res = await check(aBody({ lines: 51 }));
    expect([await outcome(res), state.detectCalls, logger.events]).toEqual([
      INVALID,
      0,
      [INVALID_EVENT],
    ]);
  });

  it.each([null, "wrong-token-wrong-token-wrong-tok"])(
    "auth_comes_before_validation_%s",
    async (token) => {
      const res = await post("/tools/localization-check", aBody({ lines: 51 }), token);
      const text = await res.text();
      expect([res.status, text.includes("invalid_input"), /too big|array/i.test(text)]).toEqual([
        401,
        false,
        false,
      ]);
    },
  );

  it.each(BAD_PACKAGES)("rejects_%s_without_work", async (_name, patch) => {
    state.detectCalls = 0;
    const res = await check(withParams(patch));
    expect([await outcome(res), state.detectCalls]).toEqual([INVALID, 0]);
  });

  it("copy_fit_invalid_input_is_the_same_fixed_error", async () => {
    const res = await post("/tools/copy-fit-check", { parameters: { items: [] } }, TOKEN);
    expect(await outcome(res)).toEqual(INVALID);
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
    // Vitest routes console through RPC, so only consoleCalls (the replaced console.log) can fail.
    const spy = vi.spyOn(process.stdout, "write");
    await check(aBody({ text: "ZZMARKER copy" }));
    const { calls } = spy.mock;
    const written = calls.join("");
    expect(written).not.toContain("ZZMARKER");
    expect(consoleCalls).toEqual([]);
  });

  it("defect_returns_500_without_internals", async () => {
    const errors: unknown[][] = [];
    vi.spyOn(globalConsole(), "error").mockImplementation((...args) => void errors.push(args));
    state.detectorThrows = true;
    const res = await check(aBody());
    const text = (await res.text()).toLowerCase();
    expect([res.status, text]).toEqual([500, '{"error":"internal_error"}']);
    expect(logger.events.map((e) => e.event)).toContain("defect");
    expect(String(errors.flat().map(String))).not.toContain("secret detail");
  });

  it("does_not_advertise_express", async () => {
    expect((await fetch(`${base}/discovery`)).headers.get("x-powered-by")).toBeNull();
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

  it("refuses_a_token_with_surrounding_whitespace", () => {
    expect(() => createApp({ ...cfg(), token: ` ${TOKEN}` })).toThrow();
    expect(() => createApp({ ...cfg(), token: `${TOKEN}\n` })).toThrow();
  });
});
