import { describe, expect, it } from "vitest";
import { z } from "zod";
import { safeHandler } from "../../src/presentation/safe-handler";
import { RecordingLogger } from "../support/logger";

const schema = z.object({ n: z.number() });
const COUNTS = { lines: 1, locales: 0 };

describe("safeHandler", () => {
  it("treats_a_returned_promise_as_a_defect", () => {
    const logger = new RecordingLogger();
    // @ts-expect-error a Promise body must not type-check
    const handler = safeHandler("t", logger, schema, () => ({
      body: Promise.resolve(1),
      ...COUNTS,
    }));
    expect(() => handler({ n: 1 })).toThrow("internal_error");
    expect(logger.events.map((e) => [e.event, e.status])).toEqual([["defect", "error"]]);
  });

  it("returns_the_body_and_logs_ok", () => {
    const logger = new RecordingLogger();
    const handler = safeHandler("t", logger, schema, (p) => ({ body: { n: p.n + 1 }, ...COUNTS }));
    expect([handler({ n: 1 }), logger.events.map((e) => e.status)]).toEqual([{ n: 2 }, ["ok"]]);
  });

  it("maps_invalid_input_to_the_fixed_error_without_running_fn", () => {
    const logger = new RecordingLogger();
    let ran = false;
    const handler = safeHandler("t", logger, schema, () => ((ran = true), { body: 1, ...COUNTS }));
    expect(() => handler({ n: "secret" })).toThrow(/^invalid_input$/);
    expect([ran, logger.events.map((e) => e.status)]).toEqual([false, ["invalid_input"]]);
  });
});
