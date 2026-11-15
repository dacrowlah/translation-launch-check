import { describe, expect, it } from "vitest";
import { tokensOf } from "../../support/builders";
import { valueRows } from "../../support/rows";

const NONE = [[], [], []];
const MASTER = "Spend \u00a510,000 until 8 PM";

describe("a japanese amount with a multiplier is one price", () => {
  it.each([
    ["1\u4e07\u5186", "10000"],
    ["1.5\u4e07\u5186", "15000"],
    ["5\u5343\u5186", "5000"],
  ])("reads_an_amount_times_its_multiplier_%#", (text, amount) => {
    expect(tokensOf("ja-JP", text).money).toEqual([{ amount, currency: "JPY" }]);
  });

  it.each([
    [MASTER, "1\u4e07\u5186 20\u6642\u307e\u3067"],
    [MASTER, "1\u4e07\u5186\u4ee5\u4e0a 20\u6642\u307e\u3067"],
    ["Only \u00a55,000", "5\u5343\u5186\u306e\u307f"],
    ["Spend \u00a510,000, 8-11 PM", "1\u4e07\u5186 20\uff5e23\u6642"],
  ])("a_price_with_a_multiplier_and_the_time_after_it_match_%#", (master, target) => {
    expect(valueRows(master, target, "ja-JP")).toEqual(NONE);
  });

  it("a_changed_price_with_a_multiplier_is_an_amount_finding", () => {
    expect(valueRows(MASTER, "2\u4e07\u5186 20\u6642\u307e\u3067", "ja-JP")).toEqual([
      [],
      [["10000.00 JPY", "20000.00 JPY"]],
      [],
    ]);
  });

  it("a_changed_time_after_a_price_with_a_multiplier_is_a_finding", () => {
    expect(valueRows(MASTER, "1\u4e07\u5186 21\u6642\u307e\u3067", "ja-JP")).toEqual([
      [["20:00", "21:00"]],
      [],
      [],
    ]);
  });
});

describe("a multiplier counts wherever a numeral is read", () => {
  it.each([
    ["1\u4e07\u30dd\u30a4\u30f3\u30c8", ["10000"]],
    ["\u5148\u77401\u5343\u540d\u69d8", ["1000"]],
    ["1.5\u4e07\u4eba", ["15000"]],
  ])("reads_a_count_times_its_multiplier_%#", (text, numbers) => {
    expect(tokensOf("ja-JP", text).numbers).toEqual(numbers);
  });

  it.each([
    ["\u00a51\u4e07", "10000"],
    ["1\u4e072\u5343\u5186", "12000"],
    ["1\u5343\u4e07\u5186", "10000000"],
    ["1\u4e072000\u5186", "12000"],
    ["1.5\u4e072\u5343\u5186", "17000"],
  ])("reads_a_prefix_or_compound_price_as_one_amount_%#", (text, amount) => {
    expect(tokensOf("ja-JP", text).money).toEqual([{ amount, currency: "JPY" }]);
  });

  it("a_changed_count_with_a_multiplier_is_a_numbers_finding", () => {
    const rowsOf = valueRows(
      "Up to 10,000 points",
      "\u6700\u59272\u4e07\u30dd\u30a4\u30f3\u30c8",
      "ja-JP",
    );
    expect(rowsOf).toEqual([[["10000", "20000"]], [], []]);
  });

  it("a_changed_compound_price_is_an_amount_finding", () => {
    const rowsOf = valueRows("Only \u00a512,000", "1\u4e073\u5343\u5186\u306e\u307f", "ja-JP");
    expect(rowsOf).toEqual([[], [["12000.00 JPY", "13000.00 JPY"]], []]);
  });
});

describe("a latin word after a suffix currency is copy", () => {
  it.each([
    ["\u00a51,000 off", "1,000\u5186OFF"],
    ["\u00a5500 off coupon", "500\u5186off\u30af\u30fc\u30dd\u30f3"],
    ["$10 off", "10\u30c9\u30ebOFF"],
  ])("a_price_before_off_is_money_%#", (master, target) => {
    expect(valueRows(master, target, "ja-JP")).toEqual(NONE);
  });

  it("a_changed_price_before_off_is_an_amount_finding", () => {
    expect(valueRows("\u00a51,000 off", "2,000\u5186OFF", "ja-JP")).toEqual([
      [],
      [["1000.00 JPY", "2000.00 JPY"]],
      [],
    ]);
  });

  it("a_latin_currency_never_runs_into_a_latin_word", () => {
    expect(tokensOf("en-US", "Save 20 USDT").money).toEqual([]);
  });
});

describe("hundreds, hundred millions and a chain with no numeral before it", () => {
  it.each([
    ["5\u53433\u767e\u5186", "5300"],
    ["\u7dcf\u984d1\u5104\u5186", "100000000"],
    ["1\u51042\u5343\u4e07\u5186", "120000000"],
    ["\u5343\u5186OFF", "1000"],
    ["\u767e\u5186\u30b7\u30e7\u30c3\u30d7", "100"],
  ])("reads_a_price_with_any_multiplier_%#", (text, amount) => {
    expect(tokensOf("ja-JP", text).money).toEqual([{ amount, currency: "JPY" }]);
  });

  it("a_changed_price_with_a_hundreds_multiplier_is_an_amount_finding", () => {
    expect(valueRows("\u00a55,300", "5\u53434\u767e\u5186", "ja-JP")).toEqual([
      [],
      [["5300.00 JPY", "5400.00 JPY"]],
      [],
    ]);
  });

  it("a_multiplier_in_a_name_is_no_number_without_a_currency", () => {
    const found = tokensOf("ja-JP", "\u5343\u8449\u5e97");
    expect([found.numbers, found.money]).toEqual([[], []]);
  });

  it("reads_a_long_digit_run_after_a_multiplier_as_one_trailing_numeral", () => {
    const found = tokensOf("ja-JP", `1\u4e07${"0".repeat(30)}x`);
    expect([found.numbers, found.money]).toEqual([["10000"], []]);
  });
});

describe("a latin word before a prefix currency is copy", () => {
  it.each([
    ["SALE \u00a5500", "SALE\u00a5500"],
    ["New \u00a51,000", "NEW\uffe51,000"],
  ])("a_price_after_a_latin_word_is_money_%#", (master, target) => {
    expect(valueRows(master, target, "ja-JP")).toEqual(NONE);
  });

  it("a_changed_price_after_a_latin_word_is_an_amount_finding", () => {
    expect(valueRows("SALE \u00a5500", "SALE\u00a5600", "ja-JP")).toEqual([
      [],
      [["500.00 JPY", "600.00 JPY"]],
      [],
    ]);
  });

  it("a_latin_currency_never_follows_a_latin_word", () => {
    expect(tokensOf("de-DE", "NurEUR10").money).toEqual([]);
  });
});

describe("a multiplier after a kanji numeral or a vague count is no amount", () => {
  it.each([
    ["\u4e8c\u4e07\u5186\u5206"],
    ["\u8cde\u91d1\u5341\u4e07\u5186"],
    ["\u6570\u4e07\u5186\u304a\u5f97"],
    ["\u4f55\u5343\u5186\u3082"],
    ["\u91d1\u5f10\u4e07\u5186"],
    ["\u91d1\u62fe\u4e07\u5186"],
  ])("reads_no_price_after_a_kanji_numeral_or_a_vague_count_%#", (text) => {
    expect(tokensOf("ja-JP", text).money).toEqual([]);
  });

  it("known_limitation_an_amount_in_kanji_numerals_is_not_read", () => {
    expect(valueRows("\u00a520,000 gift card", "\u4e8c\u4e07\u5186\u5206", "ja-JP")).toEqual([
      [],
      [],
      [["JPY", null]],
    ]);
  });
});
