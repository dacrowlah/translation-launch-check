import { describe, expect, it } from "vitest";
import { timesIn, tokensOf } from "../../support/builders.js";
import { numberRows, valueRows } from "../../support/rows.js";

const NONE = [[], [], []];

describe("a currency guards only the number it is attached to", () => {
  it.each([
    ["Mon-Fri 9am-6pm", "Mo.\u2013Fr. 9\u201318 Uhr", "de-DE"],
    ["Mon-Fri 9am-6pm", "Mo.\u2013Fr. 9\u201318 Uhr", "de-CH"],
    ["Mon-Fri 9am-6pm, Sat 10am-4pm", "Mo.-Fr. 9-18 Uhr, Sa. 10-16 Uhr", "de-DE"],
    ["Fri 8 PM", "Fr. 20:00 Uhr", "de-DE"],
    ["Fri 8 PM", "Fr. 20 Uhr", "de-DE"],
    ["Fri 9 PM", "Fr. 21 h", "fr-FR"],
  ])("fr_is_friday_where_it_is_no_currency_%#", (master, target, locale) => {
    expect(valueRows(master, target, locale)).toEqual(NONE);
  });

  it.each([
    ["All items 1,000 yen until 8 PM", "\u5168\u54c11,000\u5186 20\u6642\u307e\u3067", "ja-JP"],
    ["From $50 until 2 PM", "D\u00e8s 50 $ 14 h", "fr-FR"],
  ])("a_time_after_a_suffix_currency_is_a_time_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it.each([
    ["Fri 8 PM", "Fr. 21 Uhr", "de-DE", [["20:00", "21:00"]]],
    ["Mon-Fri 9am-6pm", "Mo.\u2013Fr. 9\u201317 Uhr", "de-CH", [["18:00", "17:00"]]],
  ])("a_changed_time_after_fr_is_a_finding_%#", (master, target, locale, expected) => {
    expect(numberRows(master, target, locale)).toEqual(expected);
  });

  it("fr_is_a_currency_only_in_swiss_german", () => {
    const read = (locale: string) => tokensOf(locale, "Fr. 29.99").money;
    expect([read("de-CH"), read("de-DE")]).toEqual([[{ amount: "29.99", currency: "CHF" }], []]);
  });

  it("a_price_written_in_yen_is_the_same_price_as_en_yen", () => {
    expect(tokensOf("en-US", "1,000 yen").money).toEqual([{ amount: "1000", currency: "JPY" }]);
  });

  it("a_swiss_price_before_a_time_is_still_money", () => {
    expect([
      tokensOf("de-CH", "Nur CHF 9.50 bis 20 Uhr").money,
      timesIn("de-CH", "CHF 9.50 bis 20 Uhr"),
    ]).toEqual([[{ amount: "9.5", currency: "CHF" }], ["20:00"]]);
  });
});
