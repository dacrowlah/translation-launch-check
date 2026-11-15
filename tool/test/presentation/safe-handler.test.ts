import { describe, expect, it } from "vitest";
import { z } from "zod";
import { safeHandler, type Handled } from "../../src/presentation/safe-handler";
import { aLogEvent, aTelemetry } from "../support/telemetry";

const schema = z.object({ n: z.number() });
const COUNTS = { lines: 1, locales: 0 };

// Each fn is a defect; a Promise result must not even type-check.
const DEFECTS: [string, (params: { n: number }) => Handled<object>][] = [
  [
    "a_throw",
    () => {
      throw new Error("secret detail");
    },
  ],
  ["a_promise_body", () => ({ body: Promise.resolve({}), ...COUNTS })],
  // @ts-expect-error a Promise result
  ["a_handler_that_returns_a_promise", () => Promise.resolve({ body: {}, ...COUNTS })],
];

describe("safeHandler", () => {
  it("returns_ok_with_the_body_fields_and_logs_one_ok_event", () => {
    const t = aTelemetry();
    const handler = safeHandler("t", t, schema, (p) => ({ body: { n: p.n + 1 }, ...COUNTS }));
    expect([handler({ n: 1 }), t.logger.events]).toEqual([
      { status: "ok", n: 2 },
      [aLogEvent({ tool: "t", status: "ok", ...COUNTS })],
    ]);
  });

  it("a_status_in_the_body_never_overrides_ok", () => {
    const handler = safeHandler("t", aTelemetry(), schema, () => ({
      body: { status: "invalid_input", n: 1 },
      ...COUNTS,
    }));
    expect(handler({ n: 1 })).toEqual({ status: "ok", n: 1 });
  });

  it("answers_invalid_input_with_the_bare_token_without_running_fn", () => {
    const t = aTelemetry();
    let ran = false;
    const handler = safeHandler("t", t, schema, () => ((ran = true), { body: {}, ...COUNTS }));
    expect([handler({ n: "secret" }), ran, t.logger.events]).toEqual([
      { status: "invalid_input" },
      false,
      [aLogEvent({ tool: "t", status: "invalid_input" })],
    ]);
  });

  it.each(DEFECTS)("answers_%s_with_the_bare_internal_error_token", (_name, fn) => {
    const t = aTelemetry();
    expect([safeHandler("t", t, schema, fn)({ n: 1 }), t.logger.events]).toEqual([
      { status: "internal_error" },
      [aLogEvent({ event: "defect", tool: "t", status: "internal_error" })],
    ]);
  });

  it("rejects_a_promise_body_at_compile_time", () => {
    const fn = () => ({ body: Promise.resolve({}), ...COUNTS });
    // @ts-expect-error a Promise body must not type-check
    expect(typeof safeHandler("t", aTelemetry(), schema, fn)).toBe("function");
  });
});
