import { describe, expect, it } from "vitest";
import { parseRules } from "../../src/infrastructure/rules-schema";
import { rawRules, testRules } from "../support/rules";

const severities = (): Record<string, unknown> =>
  rawRules()["severities"] as Record<string, unknown>;

const section = (key: string): object => rawRules()[key] as object;
const withCalendar = (part: object) => ({
  ...rawRules(),
  calendar: { ...section("calendar"), ...part },
});
const withGlossary = (part: object) => ({
  ...rawRules(),
  glossary: { ...section("glossary"), ...part },
});

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

  it("rejects_a_calendar_with_eleven_months", () => {
    const months = { en: Array(11).fill(["May"]) };
    expect(() => parseRules(withCalendar({ months }))).toThrow();
  });

  it("rejects_a_calendar_with_six_weekdays", () => {
    const weekdays = { en: Array(6).fill(["Mon"]) };
    expect(() => parseRules(withCalendar({ weekdays }))).toThrow();
  });

  it("rejects_an_empty_calendar_name", () => {
    const months = { en: Array(12).fill([""]) };
    expect(() => parseRules(withCalendar({ months }))).toThrow();
  });

  it("rejects_a_master_locale_other_than_en_US", () => {
    expect(() => parseRules({ ...rawRules(), master_locale: "en-GB" })).toThrow();
  });

  it("rejects_an_alias_to_an_unknown_locale", () => {
    const aliases = { ...(rawRules()["locale_aliases"] as object), uk: "en-XX" };
    expect(() => parseRules({ ...rawRules(), locale_aliases: aliases })).toThrow();
  });

  it("rejects_forbidden_terms_for_an_unknown_locale", () => {
    expect(() => parseRules(withGlossary({ forbidden: { "xx-XX": ["a"] } }))).toThrow();
  });

  it("rejects_approved_translations_for_an_unknown_locale", () => {
    expect(() => parseRules(withGlossary({ approved_translations: { "xx-XX": {} } }))).toThrow();
  });

  it("rejects_spelling_for_a_locale_that_is_not_configured", () => {
    const locales = Object.entries(section("locales")).filter(([id]) => id !== "de-CH");
    const aliases = Object.entries(section("locale_aliases")).filter(([, id]) => id !== "de-CH");
    const bad = {
      ...rawRules(),
      locales: Object.fromEntries(locales),
      locale_aliases: Object.fromEntries(aliases),
      glossary: { ...section("glossary"), forbidden: { "de-DE": ["garantiert"] } },
    };
    expect(() => parseRules(bad)).toThrow(/spelling: unknown locale de-CH/);
  });

  it("rejects_an_unknown_key_in_a_locale", () => {
    const locales = rawRules()["locales"] as Record<string, object>;
    const typo = { ...locales["de-DE"], length_ratio_mx: 1.2 };
    expect(() => parseRules({ ...rawRules(), locales: { ...locales, "de-DE": typo } })).toThrow();
  });

  it("rejects_an_unknown_top_level_key", () => {
    expect(() => parseRules({ ...rawRules(), extra: 1 })).toThrow();
  });

  it("rejects_an_invalid_promo_code_pattern", () => {
    expect(() => parseRules({ ...rawRules(), promo_code_pattern: "([" })).toThrow();
  });

  it("rejects_an_invalid_time_expression", () => {
    expect(() => parseRules({ ...rawRules(), time_expressions: { en: ["(["] } })).toThrow();
  });

  it("rejects_an_invalid_merge_tag_pattern", () => {
    expect(() => parseRules({ ...rawRules(), merge_tag_patterns: ["(["] })).toThrow();
  });

  it("rejects_an_invalid_artifact_pattern", () => {
    expect(() => parseRules({ ...rawRules(), artifact_patterns: ["(["] })).toThrow();
  });
});
