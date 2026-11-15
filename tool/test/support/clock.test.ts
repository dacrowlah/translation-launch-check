import { describe, expect, it } from "vitest";
import { FAKE_NOW, FakeClock } from "./clock.js";

describe("FakeClock", () => {
  it("starts_at_the_nonzero_fake_date", () => {
    expect(FAKE_NOW).toBe("2026-11-12");
    expect(new FakeClock().today()).toBe("2026-11-12");
  });

  it("answers_the_date_it_was_given", () => {
    expect(new FakeClock("2027-01-31").today()).toBe("2027-01-31");
  });
});
