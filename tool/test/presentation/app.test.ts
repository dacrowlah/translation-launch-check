import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/main.js";
import { anAppConfig, startApp, TOKEN } from "../support/app.js";
import { aBody, discoveryOf, outcome, postTo, type DiscoveredFunction } from "../support/http.js";
import { SwitchableDetector } from "../support/language-detector.js";
import { RecordingLogger } from "../support/logger.js";
import { aLogEvent } from "../support/telemetry.js";

const logger = new RecordingLogger();
const detector = new SwitchableDetector();

let server: Server;
let base = "";
beforeAll(async () => ({ server, base } = await startApp({ detector, logger })));
afterAll(() => server.close());
beforeEach(() => {
  logger.events.length = 0;
  Object.assign(detector, { throws: false, calls: 0 });
});

interface Report {
  status: string;
  rules: { version: string };
  locales: { checks: Record<string, string> }[];
}
const INVALID = [200, { status: "invalid_input" }];
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
const event = (status: string, counts = {}) =>
  aLogEvent({ tool: "localization_check", status, ...counts });
const signature = (p: DiscoveredFunction["parameters"][number]) => [p.name, p.type, p.required];
const post = (path: string, body: unknown, token: string | null) => postTo(base, path, body, token);
const check = (body: unknown) => post("/tools/localization-check", body, TOKEN);
const fit = (items: unknown[]) => post("/tools/copy-fit-check", { parameters: { items } }, TOKEN);

describe("the tool app", () => {
  it("discovery_is_public_and_lists_each_tool_with_its_parameter_types", async () => {
    const functions = await discoveryOf(base);
    expect(functions.map((f) => [f.name, f.parameters.map(signature)])).toEqual([
      [
        "localization_check",
        [
          ["campaign", "string", true],
          ["master_locale", "string", true],
          ["locales", "array", true],
          ["lines", "array", true],
        ],
      ],
      ["copy_fit_check", [["items", "array", true]]],
    ]);
  });

  it.each([null, "wrong-token-wrong-token-wrong-tok"])(
    "a_bad_or_missing_token_is_the_sdks_401_before_validation_%s",
    async (token) => {
      const res = await post("/tools/localization-check", aBody({ lines: 51 }), token);
      expect([res.status, (await res.text()).includes("invalid_input"), detector.calls]).toEqual([
        401,
        false,
        0,
      ]);
    },
  );

  it("oversized_input_is_invalid_input_and_does_no_work", async () => {
    const res = await check(aBody({ lines: 51 }));
    expect([await outcome(res), detector.calls, logger.events]).toEqual([
      INVALID,
      0,
      [event("invalid_input")],
    ]);
  });

  it.each(BAD_PACKAGES)("rejects_%s_without_work", async (_name, patch) => {
    const res = await check(withParams(patch));
    expect([await outcome(res), detector.calls]).toEqual([INVALID, 0]);
  });

  it("copy_fit_invalid_input_is_the_same_bare_token", async () => {
    expect(await outcome(await fit([]))).toEqual(INVALID);
  });

  it("returns_status_ok_with_the_report", async () => {
    const res = await check(aBody());
    const body = (await res.json()) as Report;
    const checks = Object.keys(body.locales[0]?.checks ?? {}).length;
    expect([res.status, body.status, checks, body.rules.version]).toEqual([200, "ok", 24, "1.0"]);
  });

  it("each_finding_in_the_response_carries_its_confidence", async () => {
    const body = (await (await check(aBody({ text: "Only $20, 2 days" }))).json()) as {
      locales: { lines: { findings: { check: string; confidence: string }[] }[] }[];
    };
    const findings = body.locales[0]?.lines[0]?.findings ?? [];
    expect(findings.map((f) => [f.check, f.confidence])).toEqual([
      ["numbers", "certain"],
      ["currency_code", "unsure"],
    ]);
  });

  it("copy_fit_check_returns_status_ok_with_its_items", async () => {
    const res = await fit([{ channel: "google_ads", field: "headline", text: "x".repeat(31) }]);
    const body = (await res.json()) as { status: string; items: { fits: boolean }[] };
    expect([res.status, body.status, body.items.map((i) => i.fits)]).toEqual([200, "ok", [false]]);
  });

  it("logs_one_tool_call_with_counts_only", async () => {
    await check(aBody({ text: "ZZMARKER copy" }));
    expect(logger.events).toEqual([event("ok", { lines: 1, locales: 1 })]);
  });

  it("a_defect_is_the_bare_internal_error_token", async () => {
    detector.throws = true;
    const res = await check(aBody());
    expect([res.status, await res.text()]).toEqual([200, '{"status":"internal_error"}']);
    expect(logger.events.map((e) => [e.event, e.status])).toEqual([["defect", "internal_error"]]);
  });

  it("does_not_advertise_express", async () => {
    expect((await fetch(`${base}/discovery`)).headers.get("x-powered-by")).toBeNull();
  });

  it("refuses_to_start_without_a_long_token", () => {
    expect(() => createApp(anAppConfig({ token: "short" }))).toThrow(/TOOL_BEARER_TOKEN/);
    expect(() => createApp(anAppConfig({ token: undefined }))).toThrow(/TOOL_BEARER_TOKEN/);
  });

  it("refuses_a_token_with_surrounding_whitespace", () => {
    expect(() => createApp(anAppConfig({ token: ` ${TOKEN}` }))).toThrow(/TOOL_BEARER_TOKEN/);
    expect(() => createApp(anAppConfig({ token: `${TOKEN}\n` }))).toThrow(/TOOL_BEARER_TOKEN/);
  });
});
