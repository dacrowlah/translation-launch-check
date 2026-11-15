import { describe, expect, it } from "vitest";
import { rawRules, rejection } from "../support/rules.js";

/** The rules keys the unsure tier, the script rule, time zones and promo codes read. */
describe("parseRules, language, unsure and promo keys", () => {
  it("rejects_an_unsure_severity_outside_the_enum", () => {
    expect(rejection({ ...rawRules(), unsure_severity: "maybe" })).toMatch(
      /^unsure_severity: Invalid option/,
    );
  });

  it.each([0, 1.5])("rejects_a_japanese_share_outside_zero_to_one_%#", (share) => {
    const bad = { ...rawRules(), language_check: { min_letters: 20, japanese_share: share } };
    expect(rejection(bad)).toMatch(/^language_check\.japanese_share: /);
  });

  it("rejects_time_zone_exclusions_that_are_not_string_lists", () => {
    const bad = { ...rawRules(), time_zone_exclusions: { fr: "ET" } };
    expect(rejection(bad)).toMatch(/^time_zone_exclusions\.fr: /);
  });

  it("rejects_a_promo_code_pattern_without_its_excluded_suffixes_place", () => {
    const bad = { ...rawRules(), promo_code_pattern: "\\b[A-Z]{2,}[0-9]{1,4}\\b" };
    expect(rejection(bad)).toMatch(/promo_code_pattern: no \{excluded_suffixes\} place/);
  });

  it("rejects_an_empty_excluded_promo_suffix", () => {
    const bad = { ...rawRules(), promo_code_excluded_suffixes: ["GB", ""] };
    expect(rejection(bad)).toMatch(/^promo_code_excluded_suffixes\.1: /);
  });
});
