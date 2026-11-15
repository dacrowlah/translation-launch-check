import { describe, expect, it } from "vitest";
import {
  hourMinutes,
  isCandidate,
  minuteSeparator,
} from "../../../src/domain/tokens/clock-formats.js";
import { testLocale, testRules } from "../../support/rules.js";

const whole = (source: string) => new RegExp(`^(?:${source})$`, "u");

describe("hourMinutes", () => {
  it("names_the_hour_and_minutes_with_the_given_groups", () => {
    const m = whole(hourMinutes("[:.]", { groups: { h: "h0", m: "m0" } })).exec("9.30");
    expect([m?.groups?.h0, m?.groups?.m0]).toEqual(["9", "30"]);
  });

  it.each([
    ["9", true],
    ["9:30", true],
    ["9h30", false],
    ["123", false],
  ])("takes_optional_minutes_after_the_separator_%#", (text, matches) => {
    expect(whole(hourMinutes("[:.]")).test(text)).toBe(matches);
  });

  it("requires_the_minutes_when_asked", () => {
    const required = whole(hourMinutes("[:.]", { required: true }));
    expect([required.test("9"), required.test("9.30")]).toEqual([false, true]);
  });
});

describe("time formats in the rules", () => {
  it("reads_the_minute_separators_of_the_language", () => {
    expect(minuteSeparator(testLocale("fr-FR"), testRules())).toBe("[:.]");
  });

  it.each([
    ["9 Uhr", false],
    [{ pattern: "x", candidate: true }, true],
    [{ pattern: "x", candidate: false }, false],
  ])("a_format_is_a_candidate_only_when_its_object_says_so_%#", (format, candidate) => {
    expect(isCandidate(format)).toBe(candidate);
  });
});
