import { describe, expect, it } from "vitest";
import { rawRules, rejection } from "./rules.js";

describe("rejection", () => {
  it("says_accepted_for_the_shipped_rules", () => {
    expect(rejection(rawRules())).toBe("accepted");
  });
  it("names_the_path_and_message_of_a_shape_issue", () => {
    expect(rejection({ ...rawRules(), unsure_severity: 3 })).toMatch(/^unsure_severity: /);
  });
  it("returns_a_cross_check_message_as_written", () => {
    expect(
      rejection({ ...rawRules(), master_locale: "en-US", locale_aliases: { x: "xx-XX" } }),
    ).toBe("Error: invalid rules: locale_aliases: unknown locale xx-XX");
  });
});
