import { describe, expect, it } from "vitest";
import { makeFinding } from "../../src/domain/finding";
import { testRules } from "../support/rules";

describe("makeFinding", () => {
  it("makeFinding_takes_severity_from_rules", () => {
    expect(makeFinding(testRules(), "url_path", { detail: "d" })).toEqual({
      check: "url_path",
      severity: "info",
      detail: "d",
      expected: null,
      found: null,
    });
  });

  it("makeFinding_carries_expected_and_found", () => {
    const text = { detail: "d", expected: "10", found: "12" };
    expect(makeFinding(testRules(), "numbers", text)).toEqual({
      check: "numbers",
      severity: "blocker",
      detail: "d",
      expected: "10",
      found: "12",
    });
  });

  it("makeFinding_follows_a_changed_severity_in_rules", () => {
    const rules = testRules();
    const changed = { ...rules, severities: { ...rules.severities, url_path: "blocker" as const } };
    expect(makeFinding(changed, "url_path", { detail: "d" }).severity).toBe("blocker");
  });
});
