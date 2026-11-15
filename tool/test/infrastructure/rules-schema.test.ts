import { describe, expect, it } from "vitest";
import { z } from "zod";
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

const named = (issue: z.core.$ZodIssue): string => `${issue.path.join(".")}: ${issue.message}`;

/** What a rejection names: each zod issue as "path: message", or the cross-check's message. */
const rejection = (json: unknown): string => {
  try {
    parseRules(json);
  } catch (error) {
    return error instanceof z.ZodError ? error.issues.map(named).join("; ") : String(error);
  }
  return "accepted";
};
const locales = (): Record<string, object> => rawRules()["locales"] as Record<string, object>;
const withLocale = (id: string, patch: object) => ({
  ...rawRules(),
  locales: { ...locales(), [id]: { ...locales()[id], ...patch } },
});
const without = (key: string) =>
  Object.fromEntries(Object.entries(rawRules()).filter(([k]) => k !== key));

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
    expect(rejection(bad)).toMatch(/^severities\.numbers: Invalid option/);
  });

  it("rejects_a_check_id_missing_from_severities", () => {
    const rest = Object.entries(severities()).filter(([id]) => id !== "numbers");
    const bad = { ...rawRules(), severities: Object.fromEntries(rest) };
    expect(rejection(bad)).toMatch(/^severities\.numbers: /);
  });

  it("rejects_an_unknown_check_id_in_severities", () => {
    const bad = { ...rawRules(), severities: { ...severities(), made_up: "info" } };
    expect(rejection(bad)).toBe('severities: Unrecognized key: "made_up"');
  });

  it("rejects_an_effective_date_that_is_not_iso", () => {
    expect(rejection({ ...rawRules(), effective_date: "13/11/2026" })).toMatch(/^effective_date: /);
  });

  it("rejects_a_calendar_with_eleven_months", () => {
    const months = { en: Array(11).fill({ full: ["May"], short: [] }) };
    expect(rejection(withCalendar({ months }))).toMatch(/^calendar\.months\.en: Too small/);
  });

  it("rejects_a_calendar_with_six_weekdays", () => {
    const weekdays = { en: Array(6).fill({ full: ["Monday"], short: ["Mon"] }) };
    expect(rejection(withCalendar({ weekdays }))).toMatch(/^calendar\.weekdays\.en: Too small/);
  });

  it("rejects_an_empty_calendar_name", () => {
    const months = { en: Array(12).fill({ full: [""], short: [] }) };
    expect(rejection(withCalendar({ months }))).toMatch(/^calendar\.months\.en\.0\.full\.0: /);
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
    expect(rejection({ ...rawRules(), master_locale: "en-GB" })).toMatch(/^master_locale: /);
  });

  it("rejects_an_alias_to_an_unknown_locale", () => {
    const aliases = { ...(rawRules()["locale_aliases"] as object), uk: "en-XX" };
    expect(rejection({ ...rawRules(), locale_aliases: aliases })).toMatch(/locale_aliases.*en-XX/);
  });

  it("rejects_forbidden_terms_for_an_unknown_locale", () => {
    expect(rejection(withGlossary({ forbidden: { "xx-XX": ["a"] } }))).toMatch(
      /glossary: unknown locale xx-XX/,
    );
  });

  it("rejects_approved_translations_for_an_unknown_locale", () => {
    const bad = withGlossary({ approved_translations: { "xx-XX": {} } });
    expect(rejection(bad)).toMatch(/glossary: unknown locale xx-XX/);
  });

  it("rejects_accepted_loanwords_for_a_language_no_locale_uses", () => {
    const bad = { ...rawRules(), accepted_loanwords: { xx: ["a"] } };
    expect(() => parseRules(bad)).toThrow(/accepted_loanwords: unknown language xx/);
  });

  it("rejects_accepted_loanwords_that_are_not_string_lists", () => {
    const bad = { ...rawRules(), accepted_loanwords: { de: "sale" } };
    expect(rejection(bad)).toMatch(/^accepted_loanwords\.de: /);
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
    const bad = withLocale("de-DE", { length_ratio_mx: 1.2 });
    expect(rejection(bad)).toBe('locales.de-DE: Unrecognized key: "length_ratio_mx"');
  });

  it("rejects_an_unknown_top_level_key", () => {
    expect(rejection({ ...rawRules(), extra: 1 })).toBe(': Unrecognized key: "extra"');
  });

  it("rejects_an_invalid_promo_code_pattern", () => {
    expect(rejection({ ...rawRules(), promo_code_pattern: "([" })).toMatch(/^promo_code_pattern: /);
  });

  it("rejects_an_invalid_time_expression", () => {
    const bad = { ...rawRules(), time_expressions: { en: ["(["] } };
    expect(rejection(bad)).toMatch(/^time_expressions\.en\.0: /);
  });

  it("rejects_an_invalid_merge_tag_pattern", () => {
    expect(rejection({ ...rawRules(), merge_tag_patterns: ["(["] })).toMatch(
      /^merge_tag_patterns\.0: /,
    );
  });

  it("rejects_an_invalid_artifact_pattern", () => {
    expect(rejection({ ...rawRules(), artifact_patterns: ["(["] })).toMatch(
      /^artifact_patterns\.0: /,
    );
  });

  it("rejects_a_script_outside_the_enum", () => {
    expect(rejection(withLocale("de-DE", { script: "cyrillic" }))).toMatch(
      /^locales\.de-DE\.script: /,
    );
  });

  it("rejects_a_limit_that_is_not_positive", () => {
    const limits = { ...section("limits"), max_lines: 0 };
    expect(rejection({ ...rawRules(), limits })).toMatch(/^limits\.max_lines: Too small/);
  });

  it("rejects_a_missing_top_level_key", () => {
    expect(rejection(without("channels"))).toMatch(/^channels: /);
  });

  it("rejects_a_locale_key_that_is_not_a_locale_code", () => {
    const { "de-DE": de, ...rest } = locales();
    expect(rejection({ ...rawRules(), locales: { ...rest, deDE: de } })).toMatch(
      /^locales\.deDE: /,
    );
  });
});
