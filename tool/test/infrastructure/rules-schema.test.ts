import { describe, expect, it } from "vitest";
import { parseRules } from "../../src/infrastructure/rules-schema";
import { rawRules, testRules } from "../support/rules";

const severities = (): Record<string, unknown> =>
  rawRules()["severities"] as Record<string, unknown>;

describe("parseRules", () => {
  it("parses_the_shipped_rules_file", () => {
    const r = testRules();
    expect(r.severities.language_column).toBe("blocker");
    expect(r.locales["ja-JP"]?.script).toBe("japanese");
    expect(Object.keys(r.severities)).toHaveLength(24);
    expect(r.version).toBe("1.0");
  });

  it("rejects_a_severity_outside_the_enum", () => {
    const bad = { ...rawRules(), severities: { ...severities(), numbers: "fatal" } };
    expect(() => parseRules(bad)).toThrow();
  });

  it("rejects_a_check_id_missing_from_severities", () => {
    const rest = Object.entries(severities()).filter(([id]) => id !== "numbers");
    expect(() => parseRules({ ...rawRules(), severities: Object.fromEntries(rest) })).toThrow();
  });

  it("rejects_an_unknown_check_id_in_severities", () => {
    const bad = { ...rawRules(), severities: { ...severities(), made_up: "info" } };
    expect(() => parseRules(bad)).toThrow();
  });

  it("rejects_an_effective_date_that_is_not_iso", () => {
    expect(() => parseRules({ ...rawRules(), effective_date: "13/11/2026" })).toThrow();
  });
});
