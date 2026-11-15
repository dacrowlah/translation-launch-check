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
    const months = { en: Array(11).fill({ full: ["May"], short: [] }) };
    expect(() => parseRules(withCalendar({ months }))).toThrow();
  });

  it("rejects_a_calendar_with_six_weekdays", () => {
    const weekdays = { en: Array(6).fill({ full: ["Monday"], short: ["Mon"] }) };
    expect(() => parseRules(withCalendar({ weekdays }))).toThrow();
  });

  it("rejects_an_empty_calendar_name", () => {
    const months = { en: Array(12).fill({ full: [""], short: [] }) };
    expect(() => parseRules(withCalendar({ months }))).toThrow();
  });

  it.each(["99:99", "24:00", "7:30"])("rejects_an_impossible_time_word_value_%#", (time) => {
    expect(() => parseRules({ ...rawRules(), time_words: { en: { midnight: time } } })).toThrow(
      /time_words/,
    );
  });

  it("rejects_an_empty_time_word", () => {
    const words = { en: { "": "00:00", noon: "12:00" } };
    expect(() => parseRules({ ...rawRules(), time_words: words })).toThrow(/time_words/);
  });

  it("rejects_a_date_template_that_is_no_pattern", () => {
    const forms = { en: ["{day}(\\s+{month}"] };
    expect(() => parseRules(withCalendar({ date_forms: forms }))).toThrow(/calendar/);
  });

  it("accepts_a_date_template_with_known_places", () => {
    const forms = { en: ["{day}{ordinal}\\s+{month}"] };
    expect(parseRules(withCalendar({ date_forms: forms })).calendar.date_forms).toEqual(forms);
  });

  it.each([
    [{ ja: { am: [6], pm: [0] } }],
    [{ ja: { am: [12, 0, 12], pm: [0] } }],
    [{ ja: { am: [], pm: [0] } }],
    [{ ja: { am: [12], pm: [0], noon: [12] } }],
  ])("rejects_a_twelve_oclock_rule_other_than_one_or_two_readings_of_0_or_12_%#", (twelve) => {
    expect(() => parseRules({ ...rawRules(), twelve_oclock: twelve })).toThrow(/twelve_oclock/);
  });

  it("accepts_a_twelve_oclock_rule_with_two_readings", () => {
    const twelve = { ja: { am: [12, 0], pm: [0, 12] } };
    expect(parseRules({ ...rawRules(), twelve_oclock: twelve }).twelve_oclock).toEqual(twelve);
  });

  it("accepts_a_time_word_value_up_to_23_59", () => {
    const words = { en: { late: "23:59" } };
    expect(parseRules({ ...rawRules(), time_words: words }).time_words).toEqual(words);
  });

  it("rejects_a_calendar_entry_without_full_names", () => {
    const weekdays = { en: Array(7).fill({ short: ["Mon"] }) };
    expect(() => parseRules(withCalendar({ weekdays }))).toThrow(/calendar/);
  });

  it("accepts_a_calendar_entry_with_full_and_short_names", () => {
    const weekdays = { en: Array(7).fill({ full: ["Monday"], short: ["Mon"] }) };
    expect(parseRules(withCalendar({ weekdays })).calendar.weekdays["en"]?.[0]).toEqual({
      full: ["Monday"],
      short: ["Mon"],
    });
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

  it("rejects_accepted_loanwords_for_a_language_no_locale_uses", () => {
    const bad = { ...rawRules(), accepted_loanwords: { xx: ["a"] } };
    expect(() => parseRules(bad)).toThrow(/accepted_loanwords: unknown language xx/);
  });

  it("rejects_accepted_loanwords_that_are_not_string_lists", () => {
    expect(() => parseRules({ ...rawRules(), accepted_loanwords: { de: "sale" } })).toThrow();
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
