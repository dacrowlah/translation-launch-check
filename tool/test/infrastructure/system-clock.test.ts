import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../../src/infrastructure/system-clock";

afterEach(() => vi.useRealTimers());

describe("SystemClock", () => {
  it("returns_the_utc_date_not_the_local_one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T23:59:59Z"));
    expect(new SystemClock().today()).toBe("2026-11-12");
  });

  it("rolls_over_at_utc_midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T00:00:00Z"));
    expect(new SystemClock().today()).toBe("2026-11-13");
  });
});
