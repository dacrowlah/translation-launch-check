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
  it("silences_log_info_debug_and_warn_but_not_error", () => {
    const spies = { log: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const fake = { ...spies };
    quietConsole(fake as unknown as Console);
    [fake.log, fake.info, fake.debug, fake.warn, fake.error].forEach((fn) => fn("x"));
    const called = Object.values(spies).map((spy) => spy.mock.calls.length);
    expect(called).toEqual([0, 0, 0, 0, 1]);
  });
});
