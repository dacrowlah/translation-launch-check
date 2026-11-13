import { describe, expect, it } from "vitest";
import { extractDates } from "../../../src/domain/tokens/dates";
import { testLocale, testRules } from "../../support/rules";

const read = (locale: string, text: string) => extractDates(text, testLocale(locale), testRules());
const nov29 = { month: 11, day: 29, year: null, weekday: null };

describe("extractDates", () => {
  it.each([
    ["en-US", "Nov 29"],
    ["en-US", "November 29th"],
    ["en-US", "29 November"],
    ["de-DE", "29. November"],
    ["de-DE", "29. Nov."],
    ["de-DE", "29.11."],
    ["de-CH", "29.11."],
    ["fr-FR", "29 novembre"],
    ["ja-JP", "11\u670829\u65e5"],
  ])("reads_every_written_form %s %s", (locale, text) => {
    expect(read(locale, text).dates).toEqual([nov29]);
  });

  it("reads_1er_as_day_one", () => {
    expect(read("fr-FR", "1er d\u00e9cembre").dates).toEqual([
      { month: 12, day: 1, year: null, weekday: null },
    ]);
  });

  it("reads_a_year_after_the_date", () => {
    expect(read("de-DE", "29. November 2026").dates[0]?.year).toBe(2026);
  });

  it.each([
    ["en-US", "11/29/2026"],
    ["en-GB", "29/11/2026"],
    ["fr-FR", "29/11/2026"],
    ["de-DE", "bis 29.11.2026"],
  ])("reads_a_numeric_date_with_a_year %s %s", (locale, text) => {
    expect(read(locale, text).dates).toEqual([{ ...nov29, year: 2026 }]);
  });

  it("reads_a_numeric_date_in_the_locale_order", () => {
    expect(read("en-US", "3/4/2026").dates[0]).toMatchObject({ month: 3, day: 4 });
    expect(read("en-GB", "3/4/2026").dates[0]).toMatchObject({ month: 4, day: 3 });
  });

  it.each([
    ["en-US", "Sale ends 11/29"],
    ["en-GB", "ends 29/11"],
    ["en-US", "24/7"],
    ["fr-FR", "24/7"],
    ["en-GB", "29.11."],
    ["fr-FR", "29.11."],
  ])("never_reads_a_date_without_a_year_except_dotted_german %s %s", (locale, text) => {
    expect(read(locale, text)).toEqual({ dates: [], rest: text });
  });

  it("reads_a_dotted_german_date_in_a_sentence", () => {
    expect(read("de-DE", "Ab 29.11. g\u00fcltig").dates).toEqual([nov29]);
  });

  it("does_not_read_a_price_as_a_dotted_date", () => {
    expect(read("de-CH", "Fr. 12.10.").dates).toEqual([]);
  });

  it.each([
    ["en-US", "29/11/2026"],
    ["en-GB", "11/29/2026"],
    ["de-DE", "11.29."],
    ["en-US", "32 November"],
  ])("leaves_an_impossible_numeric_date_alone %s %s", (locale, text) => {
    expect(read(locale, text)).toEqual({ dates: [], rest: text });
  });

  it("does_not_read_may_as_a_date_without_a_day", () => {
    expect(read("en-US", "May I help").dates).toEqual([]);
  });

  it("does_not_read_a_decimal_as_a_date", () => {
    expect(read("en-GB", "only 1.5 left").dates).toEqual([]);
  });

  it("takes_the_weekday_only_next_to_the_date", () => {
    expect(read("de-DE", "So geht's 29. November").dates).toEqual([nov29]);
    expect(read("de-DE", "So 29. November").dates[0]?.weekday).toBe(6);
  });

  it.each([
    ["de-DE", "Sonntag, den 29. November"],
    ["en-US", "Sunday the 29th of November"],
    ["fr-FR", "dimanche le 29 novembre"],
  ])("allows_one_article_after_a_full_weekday %s %s", (locale, text) => {
    expect(read(locale, text).dates).toEqual([{ ...nov29, weekday: 6 }]);
  });

  it("keeps_a_short_weekday_directly_against_the_date", () => {
    expect(read("de-DE", "So, den 29. November").dates).toEqual([nov29]);
  });

  it.each([
    "11\u670829\u65e5 \u65e5\u66dc\u65e5",
    "11\u670829\u65e5(\u65e5\u66dc\u65e5)",
    "11\u670829\u65e5\uff08\u65e5\uff09",
  ])("reads_the_japanese_weekday_suffix %s", (text) => {
    expect(read("ja-JP", text).dates).toEqual([{ ...nov29, weekday: 6 }]);
  });

  it("replaces_each_date_with_one_space", () => {
    expect(read("en-US", "Ends Sunday, Nov 29: sale").rest).toBe("Ends  : sale");
  });
});
