import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemStopwatch } from "../../src/infrastructure/system-stopwatch";

afterEach(() => vi.useRealTimers());

describe("SystemStopwatch", () => {
  it("measures_whole_milliseconds_since_the_mark", () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const stopwatch = new SystemStopwatch();
    const mark = stopwatch.start();
    vi.advanceTimersByTime(7.6);
    expect(stopwatch.elapsedMs(mark)).toBe(8);
  });
});
