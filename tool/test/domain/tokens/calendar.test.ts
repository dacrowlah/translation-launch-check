import { describe, expect, it } from "vitest";
import { nextOccurrence, weekdayOf } from "../../../src/domain/tokens/calendar";
import { FAKE_NOW } from "../../support/clock";

describe("calendar", () => {
  it("next_occurrence_counts_today", () => {
    expect(nextOccurrence(11, 12, FAKE_NOW)).toBe("2026-11-12");
    expect(nextOccurrence(1, 5, FAKE_NOW)).toBe("2027-01-05");
    expect(weekdayOf("2026-11-29")).toBe(6);
  });

  it.each([
    ["1970-01-01", 3],
    ["2026-11-02", 0],
    ["2026-11-08", 6],
    ["2024-02-29", 3],
  ])("numbers_weekdays_from_monday_zero %s", (iso, weekday) => {
    expect(weekdayOf(iso)).toBe(weekday);
  });

  it("keeps_a_date_earlier_this_year_in_the_past_for_next_year", () => {
    expect(nextOccurrence(11, 11, FAKE_NOW)).toBe("2027-11-11");
  });

  it("finds_the_next_leap_day", () => {
    expect(nextOccurrence(2, 29, FAKE_NOW)).toBe("2028-02-29");
  });

  it.each([
    [2, 30],
    [11, 31],
    [4, 31],
  ])("returns_null_for_a_date_that_never_exists %s/%s", (m, d) => {
    expect(nextOccurrence(m, d, FAKE_NOW)).toBeNull();
  });
});
