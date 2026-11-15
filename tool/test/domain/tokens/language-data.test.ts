import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Rules } from "../../../src/domain/rules.js";
import { extractDates } from "../../../src/domain/tokens/dates.js";
import { extractTimes } from "../../../src/domain/tokens/times.js";
import { testLocale, testRules } from "../../support/rules.js";

const TOKENS = new URL("../../../src/domain/tokens/", import.meta.url);
/** Typographic spaces, not language: the no-break and narrow no-break spaces. */
const SPACES = new Set(["\\u00a0", "\\u202f"]);
/** HTML's own character table is not language data. */
const HTML = new Set(["references.ts"]);

const escapesIn = (file: string): string[] => {
  const code = readFileSync(new URL(file, TOKENS), "utf8").replace(
    /\/\*[\s\S]*?\*\/|\/\/.*$/gmu,
    "",
  );
  return (code.match(/\\u[0-9a-fA-F]{4}/gu) ?? []).filter((e) => !SPACES.has(e.toLowerCase()));
};

const calendarWith = (part: Partial<Rules["calendar"]>): Rules => ({
  ...testRules(),
  calendar: { ...testRules().calendar, ...part },
});
const dates = (rules: Rules, locale: string, text: string) =>
  extractDates(text, testLocale(locale), rules).dates;

describe("language data lives in rules.json, not in the token code", () => {
  it("no_token_module_spells_a_non_ascii_language_character", () => {
    const files = readdirSync(TOKENS).filter((f) => f.endsWith(".ts") && !HTML.has(f));
    expect(files.flatMap((f) => escapesIn(f).map((e) => `${f}: ${e}`))).toEqual([]);
  });

  it("reads_ordinal_suffixes_from_rules", () => {
    const rules = calendarWith({ ordinals: { ...testRules().calendar.ordinals, fr: [] } });
    expect(dates(rules, "fr-FR", "1er d\u00e9cembre")).toEqual([]);
  });

  it("reads_articles_after_a_weekday_from_rules", () => {
    const rules = calendarWith({ articles: { ...testRules().calendar.articles, de: [] } });
    expect(dates(rules, "de-DE", "Sonntag, den 29. November")[0]?.weekday).toBe(null);
  });

  it("reads_the_japanese_weekday_after_a_date_from_rules", () => {
    const rules = calendarWith({ weekday_after: {} });
    expect(dates(rules, "ja-JP", "11\u670829\u65e5(\u65e5)")[0]?.weekday).toBe(null);
  });

  it("reads_japanese_date_forms_and_range_guards_from_rules", () => {
    const rules = calendarWith({ date_forms: { ...testRules().calendar.date_forms, ja: [] } });
    expect(dates(rules, "ja-JP", "11\u670829\u65e5")).toEqual([]);
  });

  it("reads_which_locales_write_dotted_dates_from_rules", () => {
    const de = { ...testLocale("de-DE"), dotted_dates: false };
    expect(extractDates("29.11.", de, testRules()).dates).toEqual([]);
  });

  it("reads_the_minutes_of_a_bare_range_start_with_the_rules_separators", () => {
    const separators = { ...testRules().time_minute_separators, de: [":"] };
    const colonOnly: Rules = { ...testRules(), time_minute_separators: separators };
    const times = (rules: Rules) =>
      extractTimes("9.30-17 Uhr", testLocale("de-DE"), rules).candidates.map((c) => c.time);
    expect([times(testRules()), times(colonOnly)]).toEqual([["09:30", "17:00"], ["17:00"]]);
  });
});
