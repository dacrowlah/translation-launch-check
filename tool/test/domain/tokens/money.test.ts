import { describe, expect, it } from "vitest";
import { checkDates } from "../../../src/domain/checks/dates.js";
import { checkCurrency } from "../../../src/domain/checks/money.js";
import { checkNumbers } from "../../../src/domain/checks/numbers.js";
import { extractMoney } from "../../../src/domain/tokens/money.js";
import { aPair, ctx, inLocale, tokensOf } from "../../support/builders.js";
import { rows } from "../../support/rows.js";

const read = inLocale(extractMoney);
const MEMBERS = "Now only $49 for members.";
/** A target locale with a "." decimal and month-first slash dates, like the en-US master. */
const DOT_DECIMAL_MDY = "ja-JP";
/** numbers, currency_amount and currency_code rows of MEMBERS against a ja-JP line. */
const priceRows = (ja: string) => {
  const [pair, c] = [aPair(MEMBERS, ja, "ja-JP"), ctx("ja-JP")];
  const r = checkCurrency(pair, c);
  return [rows(checkNumbers(pair, c)), rows(r.currency_amount), rows(r.currency_code)];
};

describe("extractMoney", () => {
  it.each([
    ["en-US", "USD 20", { amount: "20", currency: "USD" }],
    ["en-US", "20 USD", { amount: "20", currency: "USD" }],
    ["en-GB", "\u00a39.99", { amount: "9.99", currency: "GBP" }],
    ["de-CH", "CHF 1'299.50", { amount: "1299.5", currency: "CHF" }],
    ["de-DE", "49,- \u20ac", { amount: "49", currency: "EUR" }],
    ["de-DE", "5,5\u00a0\u20ac", { amount: "5.5", currency: "EUR" }],
    ["en-US", "$1.299", { amount: "1.299", currency: "USD" }],
  ])("reads_amounts_and_currencies_%#", (locale, text, money) => {
    expect(read(locale, text).money).toEqual([money]);
  });

  it.each([
    ["fr-FR", "1 299,00 \u20ac", { amount: "1299", currency: "EUR" }],
    ["fr-FR", "1 299 \u20ac", { amount: "1299", currency: "EUR" }],
    ["de-DE", "\u20ac 1 299,50", { amount: "1299.5", currency: "EUR" }],
  ])("groups_by_a_plain_space_only_with_decimals_or_a_currency_after_%#", (l, text, money) => {
    expect(read(l, text).money).toEqual([money]);
  });

  it("never_joins_a_price_and_the_number_after_it", () => {
    const found = tokensOf("en-US", "Only $20 100% guaranteed");
    expect([found.money, found.numbers]).toEqual([[{ amount: "20", currency: "USD" }], ["100%"]]);
  });

  it("leaves_a_bare_number_alone", () => {
    expect(read("en-US", "Save 20 today")).toEqual({
      money: [],
      spacedMoney: [],
      rest: "Save 20 today",
    });
  });

  it("replaces_each_price_with_one_space", () => {
    expect(read("en-US", "Now $50 only").rest).toBe("Now   only");
  });

  it("does_not_read_a_code_inside_a_word", () => {
    expect([read("en-US", "USDA 20").money, read("en-US", "20 USDA").money]).toEqual([[], []]);
  });

  it.each([
    "\u4f1a\u54e1\u306a\u3089\u4eca\u3060\u30517,000\u5186\u3067\u3059\u3002",
    "\u4f1a\u54e1\u306a\u3089\u4eca\u3060\u3051\uffe57,000\u3067\u3059\u3002",
  ])("a_yen_price_between_kana_is_money_%#", (ja) => {
    expect(priceRows(ja)).toEqual([[], [], [["USD", "JPY"]]]);
  });

  it("a_dollar_price_written_in_katakana_is_the_same_price", () => {
    const ja = "\u4f1a\u54e1\u306a\u3089\u4eca\u3060\u305149\u30c9\u30eb\u3067\u3059\u3002";
    expect(priceRows(ja)).toEqual([[], [], []]);
  });

  it("a_changed_katakana_dollar_price_is_an_amount_finding", () => {
    const ja = "\u4f1a\u54e1\u306a\u3089\u4eca\u3060\u305159\u30c9\u30eb\u3067\u3059\u3002";
    const r = checkCurrency(aPair(MEMBERS, ja, "ja-JP"), ctx("ja-JP"));
    expect(rows(r.currency_amount)).toEqual([["49.00 USD", "59.00 USD"]]);
  });
});

describe("prices in a pair", () => {
  it("compares_every_decimal_place", () => {
    const r = checkCurrency(aPair("Only $1.299", "Only $1.29", "en-GB"), ctx("en-GB"));
    expect(rows(r.currency_amount)).toEqual([["1.299 USD", "1.29 USD"]]);
  });

  it("shows_whole_amounts_with_two_decimals", () => {
    const r = checkCurrency(aPair("Only $50", "Nur 60 $"), ctx());
    expect(rows(r.currency_amount)).toEqual([["50.00 USD", "60.00 USD"]]);
  });

  it("a_currency_sign_before_a_slash_date_with_a_year_leaves_the_date", () => {
    const [pair, c] = [
      aPair("Ends $ 11/29/2026", "Ends 11/29/2026", DOT_DECIMAL_MDY),
      ctx(DOT_DECIMAL_MDY),
    ];
    const found = [checkDates(pair, c).dates, checkCurrency(pair, c).currency_amount];
    expect([...found.map(rows), rows(checkNumbers(pair, c))]).toEqual([[], [], []]);
  });

  it("a_changed_date_after_a_currency_sign_is_a_dates_finding", () => {
    const pair = aPair("Ends $ 11/29/2026", "Ends 11/30/2026", DOT_DECIMAL_MDY);
    expect(rows(checkDates(pair, ctx(DOT_DECIMAL_MDY)).dates)).toEqual([["11/29", "11/30"]]);
  });

  it("the_same_euro_price_written_locally_matches", () => {
    const r = checkCurrency(aPair("\u20ac1,299.00", "1.299,00 \u20ac"), ctx());
    expect(rows(r.currency_amount)).toEqual([]);
  });
});
