import { describe, expect, it } from "vitest";
import { extractMoney } from "../../../src/domain/tokens/money.js";
import { readable } from "../../../src/domain/tokens/tokenize.js";
import { aPair, inLocale, tokensOf } from "../../support/builders.js";

/** Prices in text read as the tokenizer reads it ("\uff5e" is "~"). */
const read = (locale: string, text: string) => inLocale(extractMoney)(locale, readable(text));
const yen = (amount: string) => ({ amount, currency: "JPY" });
const euro = (amount: string) => ({ amount, currency: "EUR" });

describe("a currency written once on a range covers both ends", () => {
  it.each([
    ["ja-JP", "\u00a510,000-30,000", [yen("10000"), yen("30000")]],
    ["ja-JP", "1\u4e07\uff5e3\u4e07\u5186", [yen("10000"), yen("30000")]],
    ["de-DE", "10\u201330 \u20ac", [euro("10"), euro("30")]],
    ["fr-FR", "de 10 \u00e0 30 \u20ac", [euro("10"), euro("30")]],
  ])("reads_both_ends_as_prices_%#", (locale, text, money) => {
    expect(read(locale, text).money).toEqual(money);
  });

  it.each([
    ["en-US", "Save $10-30% more", "Save  -30% more"],
    ["de-DE", "Nur 20 $ \u2013 100 % garantiert", "Nur   \u2013 100 % garantiert"],
  ])("a_percentage_or_a_spaced_dash_ends_no_price_range_%#", (locale, text, rest) => {
    expect(read(locale, text).rest).toBe(rest);
  });
});

describe("a price range reads like a percent range", () => {
  it.each([
    ["de-DE", "Zwischen 10 und 30 \u20ac", [euro("10"), euro("30")]],
    ["fr-FR", "Entre 10 et 30 \u20ac", [euro("10"), euro("30")]],
  ])("takes_a_connector_in_any_case_%#", (locale, text, money) => {
    expect(read(locale, text).money).toEqual(money);
  });

  it("runs_upwards_or_is_no_range", () => {
    const found = read("en-US", "Give $20 to 3 friends");
    expect([found.money, found.rest]).toEqual([
      [{ amount: "20", currency: "USD" }],
      "Give   to 3 friends",
    ]);
  });

  it("a_start_larger_than_its_end_stays_text", () => {
    const found = read("de-DE", "Nur 30\u201310 \u20ac");
    expect([found.money, found.rest]).toEqual([[euro("10")], "Nur 30\u2013 "]);
  });

  it.each([
    ["1\uff5e3\u4e07\u5186", [yen("10000"), yen("30000")]],
    ["500\uff5e1\u4e07\u5186", [yen("500"), yen("10000")]],
  ])("gives_the_end_multiplier_to_a_smaller_start_without_one_%#", (text, money) => {
    expect(read("ja-JP", text).money).toEqual(money);
  });

  it("an_end_after_its_currency_starts_no_clock_range", () => {
    const tokens = tokensOf("de-CH", "Nur CHF 12\u201315 bis 20 Uhr");
    const chf = (amount: string) => ({ amount, currency: "CHF" });
    expect([tokens.money, tokens.candidates.map((c) => c.time)]).toEqual([
      [chf("12"), chf("15")],
      ["20:00"],
    ]);
  });
});

describe("a dash for the decimals of a price", () => {
  it.each(["50,\u2013 \u20ac", "50,- \u20ac", "\u20ac 50,\u2013"])("means_no_cents_%#", (text) => {
    expect(read("de-DE", text)).toEqual({ money: [euro("50")], spacedMoney: [], rest: " " });
  });
});

describe("a price with a plain-space group", () => {
  it("is_read_as_the_whole_price_or_its_parts_for_the_pair_to_decide", () => {
    expect(read("de-DE", "Nur \u20ac 2 000").spacedMoney).toEqual([
      { whole: euro("2000"), first: euro("2"), rest: ["0"] },
    ]);
  });

  it.each([
    ["Only \u20ac2,000", [euro("2000")], []],
    ["Only \u20ac2", [euro("2")], ["0"]],
    ["Only \u20ac2,500", [euro("2000")], []],
  ])("is_whole_unless_only_its_first_part_stands_opposite_%#", (master, money, numbers) => {
    const { target } = aPair(master, "Nur \u20ac 2 000");
    expect([target.money, target.numbers]).toEqual([money, numbers]);
  });

  it("never_takes_a_percentage_after_it", () => {
    expect(read("en-US", "Only $20 100% sure").money).toEqual([{ amount: "20", currency: "USD" }]);
  });
});
