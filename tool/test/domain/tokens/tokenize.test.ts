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
    ["de-DE", "1.299,00 \u20ac", { minor: 129900, currency: "EUR" }],
    ["fr-FR", "1\u202f299,00 \u20ac", { minor: 129900, currency: "EUR" }],
    ["en-US", "\u20ac1,299.00", { minor: 129900, currency: "EUR" }],
    ["en-US", "$50", { minor: 5000, currency: "USD" }],
    ["ja-JP", "5,000\u5186", { minor: 500000, currency: "JPY" }],
    ["ja-JP", "\uffe55,000", { minor: 500000, currency: "JPY" }],
  ])("parses_grouped_amounts_in_every_locale %s %s", (loc, text, money) => {
    expect(tokenize(text, loc, testRules()).money).toEqual([money]);
  });

  it("normalizes_full_width_digits", () => {
    expect(tokenize("\uff13\uff10\uff05\u30aa\u30d5", "ja-JP", testRules()).numbers).toEqual([
      "30",
    ]);
  });

  it.each([
    ["de-DE", "Bis zu 30 % auf alles"],
    ["fr-FR", "Jusqu'\u00e0 -30 %"],
    ["en-US", "Up to 30% off"],
  ])("reads_percentages %s", (loc, text) =>
    expect(tokenize(text, loc, testRules()).numbers).toEqual(["30"]),
  );

  it.each([
    ["en-US", "Sunday, Nov 29", { month: 11, day: 29, year: null, weekday: 6 }],
    ["de-DE", "Montag, 30. November", { month: 11, day: 30, year: null, weekday: 0 }],
    ["fr-FR", "dimanche 29 novembre 2026", { month: 11, day: 29, year: 2026, weekday: 6 }],
    ["ja-JP", "11\u670829\u65e5(\u65e5)", { month: 11, day: 29, year: null, weekday: 6 }],
  ])("reads_dates_with_weekdays %s %s", (loc, text, found) => {
    expect(tokenize(text, loc, testRules()).dates).toEqual([found]);
  });

  it("date_numbers_are_not_counted_as_numbers", () => {
    expect(tokenize("Ends Sunday, Nov 29: 30% off", "en-US", testRules()).numbers).toEqual(["30"]);
  });

  it("price_numbers_are_not_counted_as_numbers", () => {
    expect(tokenize("Now $50, was $80", "en-US", testRules()).numbers).toEqual([]);
  });

  it.each([
    ["de-DE", "Nur am Samstag", 5],
    ["fr-FR", "valable mardi", 1],
    ["en-US", "Only on Friday", 4],
    ["ja-JP", "\u9650\u5b9a(\u571f)", 5],
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

  it("keeps_an_impossible_calendar_date_as_a_date", () => {
    const found = tokenize("Montag, 31. November", "de-DE", testRules());
    expect(found.dates).toEqual([{ month: 11, day: 31, year: null, weekday: 0 }]);
  });

  it("reads_a_sentence_final_price_as_money_not_a_date", () => {
    const found = tokenize("Now only $1.15.", "en-US", testRules());
    expect([found.money, found.dates]).toEqual([[{ minor: 115, currency: "USD" }], []]);
  });

  it("reads_a_swiss_franc_price_as_money_not_a_date", () => {
    const found = tokenize("Fr. 12.10.", "de-CH", testRules());
    expect([found.money, found.dates]).toEqual([[{ minor: 1210, currency: "CHF" }], []]);
  });

  it.each([
    ["Fr. 27.11.", 27, 4],
    ["EUR 29.11.", 29, null],
  ])("reads_a_german_date_after_a_currency_word %s", (text, day, weekday) => {
    const found = tokenize(text, "de-DE", testRules());
    expect([found.dates, found.money]).toEqual([[{ month: 11, day, year: null, weekday }], []]);
  });

  it("reads_a_weekday_comma_date_in_swiss_german_as_a_date", () => {
    const found = tokenize("Fr., 29.11.", "de-CH", testRules());
    expect(found.dates).toEqual([{ month: 11, day: 29, year: null, weekday: 4 }]);
  });

  it("does_not_count_the_year_of_a_dotted_date_as_a_number", () => {
    expect(tokenize("bis 29.11.2026", "de-DE", testRules()).numbers).toEqual([]);
  });

  it.each([
    ["en-US", "Sale ends 11/29", ["11", "29"]],
    ["en-GB", "ends 29/11", ["29", "11"]],
    ["en-US", "24/7", ["24", "7"]],
    ["fr-FR", "24/7", ["24", "7"]],
  ])("sends_a_yearless_slash_form_to_numbers %s %s", (loc, text, numbers) => {
    const found = tokenize(text, loc, testRules());
    expect([found.dates, found.numbers]).toEqual([[], numbers]);
  });

  it("counts_a_weekday_once_when_it_belongs_to_a_date", () => {
    const found = tokenize("Sonntag, den 29. November", "de-DE", testRules());
    expect([found.dates[0]?.weekday, found.weekdays]).toEqual([6, []]);
  });

  it("gives_no_weekday_to_a_short_form_far_from_the_date", () => {
    const found = tokenize("So geht's 29. November", "de-DE", testRules());
    expect([found.dates[0]?.weekday, found.weekdays]).toEqual([null, []]);
  });

  it("reads_a_bare_japanese_weekday_name", () => {
    expect(tokenize("\u65e5\u66dc\u65e5\u307e\u3067", "ja-JP", testRules()).weekdays).toEqual([6]);
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
