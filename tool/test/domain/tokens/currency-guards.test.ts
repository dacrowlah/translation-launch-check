import { describe, expect, it } from "vitest";
import { tokensOf } from "../../support/builders.js";
import { numberRows, valueRows } from "../../support/rows.js";

const NONE = [[], [], []];

describe("a currency is a suffix only right after a numeral", () => {
  it.each([
    ["Today, CHF 9.50 until 8 PM", "Heute, CHF 9.50 bis 20 Uhr", "de-CH"],
    ["Today only. CHF 9.50 until 8 PM", "Nur heute. CHF 9.50 bis 20 Uhr", "de-CH"],
    ["Black Friday 2026. EUR 20 until 9 PM", "Black Friday 2026. EUR 20 bis 21 Uhr", "de-DE"],
    ["CHF 5.\u2013, CHF 9.50 until 8 PM", "CHF 5.\u2013, CHF 9.50 bis 20 Uhr", "de-CH"],
    ["Today only, $9 until 8 PM", "Nur heute, $9 bis 20 Uhr", "de-DE"],
  ])("a_price_after_a_comma_or_full_stop_stays_a_price_%#", (master, target, locale) => {
    expect(valueRows(master, target, locale)).toEqual(NONE);
  });

  it("a_changed_time_after_a_price_behind_a_comma_is_a_finding", () => {
    const [master, target] = ["Today, CHF 9.50 until 8 PM", "Heute, CHF 9.50 bis 21 Uhr"];
    expect(valueRows(master, target, "de-CH")).toEqual([[["20:00", "21:00"]], [], []]);
  });

  it("a_changed_time_after_a_suffix_currency_is_a_finding", () => {
    const master = "Free shipping over \u00a51,000 until 8 PM";
    expect(numberRows(master, "1,000\u5186 21\u6642\u307e\u3067", "ja-JP")).toEqual([
      ["20:00", "21:00"],
    ]);
  });
});

describe("only a currency written like a weekday is Friday after a weekday range", () => {
  it.each([
    ["Black Friday - $50 off", "Black Friday \u2013 50 $ Rabatt", "de-DE"],
    ["Cyber Monday - \u20ac20 off", "Cyber Monday \u2013 20 \u20ac Rabatt", "de-DE"],
    ["Black Friday \u2013 \u20ac50 off", "Black Friday \u2013 \u20ac 50 Rabatt", "de-DE"],
    ["Black Friday \u2013 $50 off", "Black Friday : 50 $ de remise", "fr-FR"],
  ])("a_price_after_a_weekday_and_a_dash_is_money_%#", (master, target, locale) => {
    expect(valueRows(master, target, locale)).toEqual(NONE);
  });

  it("a_changed_price_after_a_weekday_and_a_dash_is_an_amount_finding", () => {
    const pair = ["Black Friday - \u20ac50 off", "Black Friday \u2013 40 \u20ac Rabatt"] as const;
    expect(valueRows(...pair, "de-DE")).toEqual([[], [["50.00 EUR", "40.00 EUR"]], []]);
  });

  it("reads_a_price_after_an_english_weekday_and_a_dash", () => {
    const money = tokensOf("en-US", "Black Friday - $50 off").money;
    expect(money).toEqual([{ amount: "50", currency: "USD" }]);
  });
});

describe("yen is one currency word, in any case", () => {
  it.each([
    ["Prices from 1,000 yen", "Preise ab 1.000 Yen", "de-DE"],
    ["Prices from 1,000 yen", "Prix \u00e0 partir de 1 000 yens", "fr-FR"],
    ["Prices from 1,000 Yen", "1,000\u5186\u304b\u3089", "ja-JP"],
  ])("a_yen_price_in_any_case_matches_%#", (master, target, locale) => {
    expect(valueRows(master, target, locale)).toEqual(NONE);
  });

  it("a_changed_yen_price_is_an_amount_finding", () => {
    const rowsOf = valueRows("Prices from 1,000 yen", "Preise ab 2.000 Yen", "de-DE");
    expect(rowsOf).toEqual([[], [["1000.00 JPY", "2000.00 JPY"]], []]);
  });
});

describe("a written clock time is never a price", () => {
  it("reads_a_clock_time_right_after_a_currency_as_a_time", () => {
    const found = tokensOf("de-DE", "EUR 20 Uhr");
    expect([found.money, found.candidates.map((c) => c.time)]).toEqual([[], ["20:00"]]);
  });

  it("reads_a_bare_number_right_after_a_currency_as_its_price", () => {
    const found = tokensOf("de-DE", "EUR 20 bis 21 Uhr");
    expect([found.money, found.candidates.map((c) => c.time)]).toEqual([
      [{ amount: "20", currency: "EUR" }],
      ["21:00"],
    ]);
  });
});

describe("Swiss German Fr. before a clock time is the weekday", () => {
  it.each([
    ["Fri 8 PM", "Fr. 20 Uhr"],
    ["Fri 8 PM", "Fr. 20.00 Uhr"],
    ["Fri 8-10 PM", "Fr. 20\u201322 Uhr"],
    ["Fri 9am-6pm", "Fr. 9\u201318 Uhr"],
    ["Thu 9am-8pm, Fri 9am-6pm", "Do. 9\u201320 Uhr, Fr. 9\u201318 Uhr"],
    ["Mon-Thu 9am-8pm, Fri 9am-6pm", "Mo.\u2013Do. 9\u201320 Uhr, Fr. 9\u201318 Uhr"],
    ["Mon, Wed and Fri 9am-12pm", "Mo., Mi. und Fr. 9\u201312 Uhr"],
    ["Only CHF 29.90 until Fri 8 PM", "Nur Fr. 29.90 bis Fr. 20 Uhr"],
  ])("fr_before_a_clock_time_is_the_weekday_%#", (master, target) => {
    expect(valueRows(master, target, "de-CH")).toEqual(NONE);
  });

  it.each([
    ["Fri 9am-6pm", "Fr. 9\u201317 Uhr", [[["18:00", "17:00"]], [], []]],
    ["Fri 8 PM", "Fr. 21 Uhr", [[["20:00", "21:00"]], [], []]],
  ])("a_changed_time_after_fr_the_weekday_is_one_time_finding_%#", (master, target, rows) => {
    expect(valueRows(master, target, "de-CH")).toEqual(rows);
  });

  it.each([
    ["Only CHF 9.50 until 8 PM", "Nur Fr. 9.50 bis 20 Uhr"],
    ["Only CHF 20 until 8 PM", "Nur Fr. 20.\u2013 bis 20 Uhr"],
    ["Only CHF 29.90", "Nur Fr. 29.90"],
  ])("fr_before_a_price_stays_francs_%#", (master, target) => {
    expect(valueRows(master, target, "de-CH")).toEqual(NONE);
  });

  it("a_changed_price_after_fr_is_an_amount_finding", () => {
    expect(valueRows("Only CHF 19.90", "Nur Fr. 29.90", "de-CH")).toEqual([
      [],
      [["19.90 CHF", "29.90 CHF"]],
      [],
    ]);
  });
});

describe("Swiss German Fr. before a word range is the weekday", () => {
  it.each([
    ["Fri 9am to 6pm", "Fr. 9 bis 18 Uhr"],
    ["Thu 9am to 8pm, Fri 9am to 6pm", "Do. 9 bis 20 Uhr, Fr. 9 bis 18 Uhr"],
    ["Fri 8:30am to 6:30pm", "Fr. 8.30 bis 18.30 Uhr"],
  ])("fr_before_a_word_range_is_the_weekday_%#", (master, target) => {
    expect(valueRows(master, target, "de-CH")).toEqual(NONE);
  });

  it("a_changed_end_of_a_word_range_after_fr_is_one_time_finding", () => {
    expect(valueRows("Fri 9am to 5pm", "Fr. 9 bis 18 Uhr", "de-CH")).toEqual([
      [["17:00", "18:00"]],
      [],
      [],
    ]);
  });

  it.each([
    ["Only CHF 9 until 8 PM", "Nur Fr. 9.\u2013 bis 20 Uhr"],
    ["CHF 9.50 from 8 PM", "Fr. 9.50 ab 20 Uhr"],
    ["Only CHF 10.50-12.50", "Nur Fr. 10.50\u201312.50"],
    ["CHF 10.50-12.50, 2-6 PM", "Fr. 10.50\u201312.50, 14\u201318 Uhr"],
    ["Menu CHF 18-22, 6-10 PM", "Men\u00fc Fr. 18\u201322, 18\u201322 Uhr"],
  ])("fr_before_a_written_price_stays_francs_%#", (master, target) => {
    expect(valueRows(master, target, "de-CH")).toEqual(NONE);
  });

  it("known_limitation_a_whole_franc_price_before_a_word_range_reads_as_friday", () => {
    expect(valueRows("Only CHF 9 until 8 PM", "Nur Fr. 9 bis 20 Uhr", "de-CH")).toEqual([
      [[null, "9"]],
      [],
      [["CHF", null]],
    ]);
  });
});

describe("Swiss German Fr. before split hours stays francs", () => {
  it.each([
    ["Fri 9am-12pm, 2-6pm", "Fr. 9\u201312, 14\u201318 Uhr", ["09:00", null]],
    ["Fri 10am-12pm and 2-6pm", "Fr. 10\u201312 und 14\u201318 Uhr", ["10:00", null]],
    ["Fri 8am-12pm and 1-5pm", "Fr. 8 bis 12 und 13 bis 17 Uhr", ["08:00", null]],
  ])("known_limitation_fr_before_split_hours_is_francs_in_swiss_german_%#", (m, t, first) => {
    expect(valueRows(m, t, "de-CH")).toEqual([[first, ["12:00", null]], [], [[null, "CHF"]]]);
  });
});
