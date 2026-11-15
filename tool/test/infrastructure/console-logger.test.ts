import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleLogger, quietConsole } from "../../src/infrastructure/console-logger";

const EVENT = {
  event: "tool_call",
  tool: "copy_fit_check",
  status: "ok",
  latency_ms: 3,
  lines: 2,
  locales: 0,
} as const;

afterEach(() => vi.restoreAllMocks());

describe("ConsoleLogger", () => {
  it("writes_one_json_line_to_stdout", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    new ConsoleLogger().event(EVENT);
    expect(spy.mock.calls).toEqual([[`${JSON.stringify(EVENT)}\n`]]);
  });
});

describe("quietConsole", () => {
  it("silences_every_console_channel_the_sdk_writes_to", () => {
    const spies = { log: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const target = { ...spies };
    quietConsole(target);
    [target.log, target.info, target.debug, target.warn, target.error].forEach((fn) => fn("x"));
    const called = Object.values(spies).map((spy) => spy.mock.calls.length);
    expect(called).toEqual([0, 0, 0, 0, 0]);
  });
});
