import { describe, expect, it } from "vitest";
import { makeFinding, makeUnsureFinding } from "../../src/domain/finding.js";
import { testRules } from "../support/rules.js";

describe("makeFinding", () => {
  it("makeFinding_takes_severity_from_rules", () => {
    expect(makeFinding(testRules(), "url_path", { detail: "d" })).toEqual({
      check: "url_path",
      severity: "info",
      confidence: "certain",
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
      confidence: "certain",
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

describe("makeUnsureFinding", () => {
  it("takes_the_unsure_severity_from_rules_whatever_the_check", () => {
    expect(makeUnsureFinding(testRules(), "numbers", { detail: "q?", expected: "10" })).toEqual({
      check: "numbers",
      severity: "warning",
      confidence: "unsure",
      detail: "q?",
      expected: "10",
      found: null,
    });
  });

  it("follows_a_changed_unsure_severity_in_rules", () => {
    const rules = { ...testRules(), unsure_severity: "info" as const };
    expect(makeUnsureFinding(rules, "numbers", { detail: "q?" }).severity).toBe("info");
  });
});
