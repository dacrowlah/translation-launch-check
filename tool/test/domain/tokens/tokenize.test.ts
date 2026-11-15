import { describe, expect, it } from "vitest";
import { aDate, tokensOf } from "../../support/builders";

const date = (month: number, day: number, weekday: number | null) => aDate({ month, day, weekday });

describe("tokenize", () => {
  it.each([
    ["de-DE", "1.299,00 \u20ac", { amount: "1299", currency: "EUR" }],
    ["fr-FR", "1\u202f299,00 \u20ac", { amount: "1299", currency: "EUR" }],
    ["en-US", "\u20ac1,299.00", { amount: "1299", currency: "EUR" }],
    ["en-US", "$50", { amount: "50", currency: "USD" }],
    ["ja-JP", "5,000\u5186", { amount: "5000", currency: "JPY" }],
    ["ja-JP", "\uffe55,000", { amount: "5000", currency: "JPY" }],
  ])("parses_grouped_amounts_in_every_locale_%#", (loc, text, money) => {
    expect(tokensOf(loc, text).money).toEqual([money]);
  });

  it("normalizes_full_width_digits", () => {
    expect(tokensOf("ja-JP", "\uff13\uff10\uff05\u30aa\u30d5").numbers).toEqual(["30%"]);
  });

  it("takes_the_resolved_locale_rule", () => {
    expect(tokensOf("de-DE", "Save 20%").numbers).toEqual(["20%"]);
  });

  it.each([
    ["de-DE", "Bis zu 30 % auf alles"],
    ["fr-FR", "Jusqu'\u00e0 -30 %"],
    ["en-US", "Up to 30% off"],
  ])("reads_percentages_%#", (loc, text) => expect(tokensOf(loc, text).numbers).toEqual(["30%"]));

  it.each([
    ["en-US", "Sunday, Nov 29", { month: 11, day: 29, year: null, weekday: 6 }],
    ["de-DE", "Montag, 30. November", { month: 11, day: 30, year: null, weekday: 0 }],
    ["fr-FR", "dimanche 29 novembre 2026", { month: 11, day: 29, year: 2026, weekday: 6 }],
    ["ja-JP", "11\u670829\u65e5(\u65e5)", { month: 11, day: 29, year: null, weekday: 6 }],
  ])("reads_dates_with_weekdays_%#", (loc, text, found) => {
    expect(tokensOf(loc, text).dates).toEqual([found]);
  });

  it("date_numbers_are_not_counted_as_numbers", () => {
    expect(tokensOf("en-US", "Ends Sunday, Nov 29: 30% off").numbers).toEqual(["30%"]);
  });

  it("price_numbers_are_not_counted_as_numbers", () => {
    expect(tokensOf("en-US", "Now $50, was $80").numbers).toEqual([]);
  });

  it.each([
    ["de-DE", "Nur am Samstag", 5],
    ["fr-FR", "valable mardi", 1],
    ["en-US", "Only on Friday", 4],
    ["ja-JP", "\u9650\u5b9a(\u571f)", 5],
  ])("counts_a_bare_full_weekday_%#", (loc, text, weekday) => {
    expect(tokensOf(loc, text).weekdays).toEqual([weekday]);
  });

  it.each([
    ["de-DE", "So geht's"],
    ["en-US", "Do it now"],
    ["fr-FR", "le mar"],
    ["en-US", "Fri sale"],
  ])("ignores_a_short_weekday_name_alone_%#", (loc, text) => {
    expect(tokensOf(loc, text).weekdays).toEqual([]);
  });

  it("keeps_an_impossible_calendar_date_as_a_date", () => {
    const found = tokensOf("de-DE", "Montag, 31. November");
    expect(found.dates).toEqual([{ month: 11, day: 31, year: null, weekday: 0 }]);
  });

  it("reads_a_sentence_final_price_as_money_not_a_date", () => {
    const found = tokensOf("en-US", "Now only $1.15.");
    expect([found.money, found.dates]).toEqual([[{ amount: "1.15", currency: "USD" }], []]);
  });

  it("reads_a_swiss_franc_price_as_money_not_a_date", () => {
    const found = tokensOf("de-CH", "Fr. 12.10.");
    expect([found.money, found.dates]).toEqual([[{ amount: "12.1", currency: "CHF" }], []]);
  });

  it.each([
    ["Fr. 27.11.", 27, 4],
    ["EUR 29.11.", 29, null],
  ])("reads_a_german_date_after_a_currency_word_%#", (text, day, weekday) => {
    const found = tokensOf("de-DE", text);
    expect([found.dates, found.money]).toEqual([[{ month: 11, day, year: null, weekday }], []]);
  });

  it("reads_a_weekday_comma_date_in_swiss_german_as_a_date", () => {
    const found = tokensOf("de-CH", "Fr., 29.11.");
    expect(found.dates).toEqual([{ month: 11, day: 29, year: null, weekday: 4 }]);
  });

  it("does_not_count_the_year_of_a_dotted_date_as_a_number", () => {
    expect(tokensOf("de-DE", "bis 29.11.2026").numbers).toEqual([]);
  });

  it("leaves_a_yearless_slash_form_out_of_dates_and_numbers", () => {
    const found = tokensOf("en-US", "Sale ends 11/29");
    expect([found.dates, found.numbers, found.slashes.length]).toEqual([[], [], 1]);
  });

  it("counts_a_weekday_once_when_it_belongs_to_a_date", () => {
    const found = tokensOf("de-DE", "Sonntag, den 29. November");
    expect([found.dates[0]?.weekday, found.weekdays]).toEqual([6, []]);
  });

  it("gives_no_weekday_to_a_short_form_far_from_the_date", () => {
    const found = tokensOf("de-DE", "So geht's 29. November");
    expect([found.dates[0]?.weekday, found.weekdays]).toEqual([null, []]);
  });

  it("reads_a_bare_japanese_weekday_name", () => {
    expect(tokensOf("ja-JP", "\u65e5\u66dc\u65e5\u307e\u3067").weekdays).toEqual([6]);
  });

  it("finds_no_date_in_may_i_help", () => {
    expect(tokensOf("en-US", "May I help").dates).toEqual([]);
  });

  it("keeps_a_merge_tag_inside_a_url_out_of_the_other_tokens", () => {
    const text = "Go https://x.com/a?id={{id}}&n=5 {{name}} SAVE20";
    const found = tokensOf("en-US", text);
    expect([found.urls.length, found.mergeTags, found.promoCodes]).toEqual([
      1,
      ["{{name}}"],
      ["SAVE20"],
    ]);
    expect(found.numbers).toEqual([]);
  });

  it("returns_what_is_left_as_rest", () => {
    expect(tokensOf("en-US", "Sale Nov 29: $50").rest).toBe("Sale  :  ");
  });

  it("reads_a_week_of_dates", () => {
    expect(tokensOf("en-US", "Fri Nov 27 and Sun Nov 29").dates).toEqual([
      date(11, 27, 4),
      date(11, 29, 6),
    ]);
  });
});
