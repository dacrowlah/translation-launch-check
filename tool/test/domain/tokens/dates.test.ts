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
    ["en-US", "11/29"],
    ["en-GB", "29/11"],
    ["de-DE", "29. November"],
    ["de-DE", "29. Nov."],
    ["de-DE", "29.11."],
    ["de-CH", "29.11."],
    ["fr-FR", "29 novembre"],
    ["fr-FR", "29/11"],
    ["ja-JP", "11月29日"],
  ])("reads_every_written_form %s %s", (locale, text) => {
    expect(read(locale, text).dates).toEqual([nov29]);
  });

  it("reads_1er_as_day_one", () => {
    expect(read("fr-FR", "1er décembre").dates).toEqual([
      { month: 12, day: 1, year: null, weekday: null },
    ]);
  });

  it("reads_a_year_after_the_date", () => {
    expect(read("de-DE", "29. November 2026").dates[0]?.year).toBe(2026);
  });

  it("reads_numeric_dates_in_the_locale_order", () => {
    expect(read("en-US", "3/4").dates[0]).toMatchObject({ month: 3, day: 4 });
    expect(read("en-GB", "3/4").dates[0]).toMatchObject({ month: 4, day: 3 });
  });

  it.each([
    ["en-US", "29/11"],
    ["en-GB", "11/29"],
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

  it("replaces_each_date_with_one_space", () => {
    expect(read("en-US", "Ends Sunday, Nov 29: sale").rest).toBe("Ends  : sale");
  });
});
