import { describe, expect, it } from "vitest";
import { tokenize } from "../../../src/domain/tokens/tokenize";
import { testRules } from "../../support/rules";

const date = (month: number, day: number, weekday: number | null) => ({
  month,
  day,
  year: null,
  weekday,
});

describe("tokenize", () => {
  it.each([
    ["de-DE", "1.299,00 €", { minor: 129900, currency: "EUR" }],
    ["fr-FR", "1 299,00 €", { minor: 129900, currency: "EUR" }],
    ["en-US", "€1,299.00", { minor: 129900, currency: "EUR" }],
    ["en-US", "$50", { minor: 5000, currency: "USD" }],
    ["ja-JP", "5,000円", { minor: 500000, currency: "JPY" }],
    ["ja-JP", "￥5,000", { minor: 500000, currency: "JPY" }],
  ])("parses_grouped_amounts_in_every_locale %s %s", (loc, text, money) => {
    expect(tokenize(text, loc, testRules()).money).toEqual([money]);
  });

  it("normalizes_full_width_digits", () => {
    expect(tokenize("３０％オフ", "ja-JP", testRules()).numbers).toEqual(["30"]);
  });

  it.each([
    ["de-DE", "Bis zu 30 % auf alles"],
    ["fr-FR", "Jusqu'à -30 %"],
    ["en-US", "Up to 30% off"],
  ])("reads_percentages %s", (loc, text) =>
    expect(tokenize(text, loc, testRules()).numbers).toEqual(["30"]),
  );

  it.each([
    ["en-US", "Sunday, Nov 29", { month: 11, day: 29, year: null, weekday: 6 }],
    ["de-DE", "Montag, 30. November", { month: 11, day: 30, year: null, weekday: 0 }],
    ["fr-FR", "dimanche 29 novembre 2026", { month: 11, day: 29, year: 2026, weekday: 6 }],
    ["ja-JP", "11月29日(日)", { month: 11, day: 29, year: null, weekday: 6 }],
  ])("reads_dates_with_weekdays %s %s", (loc, text, found) => {
    expect(tokenize(text, loc, testRules()).dates).toEqual([found]);
  });

  it("date_numbers_are_not_counted_as_numbers", () => {
    expect(tokenize("Ends Sunday, Nov 29: 30% off", "en-US", testRules()).numbers).toEqual(["30"]);
  });

  it("price_numbers_are_not_counted_as_numbers", () => {
    expect(tokenize("Now $50, was $80", "en-US", testRules()).numbers).toEqual([]);
  });

  it("leaves_the_callers_text_untouched", () => {
    const text = "３０％";
    tokenize(text, "ja-JP", testRules());
    expect(text).toBe("３０％");
  });

  it.each([
    ["de-DE", "Nur am Samstag", 5],
    ["fr-FR", "valable mardi", 1],
    ["en-US", "Only on Friday", 4],
    ["ja-JP", "限定(土)", 5],
  ])("counts_a_bare_full_weekday %s %s", (loc, text, weekday) => {
    expect(tokenize(text, loc, testRules()).weekdays).toEqual([weekday]);
  });

  it.each([
    ["de-DE", "So geht's"],
    ["en-US", "Do it now"],
    ["fr-FR", "le mar"],
    ["en-US", "Fri sale"],
  ])("ignores_a_short_weekday_name_alone %s %s", (loc, text) => {
    expect(tokenize(text, loc, testRules()).weekdays).toEqual([]);
  });

  it("finds_no_date_in_may_i_help", () => {
    expect(tokenize("May I help", "en-US", testRules()).dates).toEqual([]);
  });

  it("keeps_a_merge_tag_inside_a_url_out_of_the_other_tokens", () => {
    const text = "Go https://x.com/a?id={{id}}&n=5 {{name}} SAVE20";
    const found = tokenize(text, "en-US", testRules());
    expect([found.urls.length, found.mergeTags, found.promoCodes]).toEqual([
      1,
      ["{{name}}"],
      ["SAVE20"],
    ]);
    expect(found.numbers).toEqual([]);
  });

  it("returns_what_is_left_as_rest", () => {
    expect(tokenize("Sale Nov 29: $50", "en-US", testRules()).rest).toBe("Sale  :  ");
  });

  it("reads_a_week_of_dates", () => {
    expect(tokenize("Fri Nov 27 and Sun Nov 29", "en-US", testRules()).dates).toEqual([
      date(11, 27, 4),
      date(11, 29, 6),
    ]);
  });
});
