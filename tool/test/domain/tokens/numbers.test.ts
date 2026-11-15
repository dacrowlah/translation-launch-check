import { describe, expect, it } from "vitest";
import { checkNumbers } from "../../../src/domain/checks/numbers.js";
import { extractNumbers } from "../../../src/domain/tokens/numbers.js";
import { aPair, ctx, inLocale, tokensOf } from "../../support/builders.js";
import { dateRows, numberRows, rows } from "../../support/rows.js";

const read = inLocale(extractNumbers);

describe("extractNumbers", () => {
  it.each([
    ["en-US", "1,299 items", ["1299"]],
    ["en-US", "9.99 and 3", ["9.99", "3"]],
    ["de-DE", "1.299,50 Stk", ["1299.5"]],
    ["de-DE", "12,50 %", ["12.5%"]],
    ["en-US", "12.5%", ["12.5%"]],
    ["en-US", "20.00 off", ["20"]],
    ["en-US", "100.0 and 10.05", ["100", "10.05"]],
    ["de-CH", "1'299 Stk", ["1299"]],
    ["fr-FR", "1\u00a0299 pi\u00e8ces", ["1299"]],
    ["en-US", "2026 plans", ["2026"]],
  ])("normalizes_separators_%#", (locale, text, numbers) => {
    expect(read(locale, text).numbers).toEqual(numbers);
  });

  it("does_not_group_a_space_before_a_short_number", () => {
    expect(read("fr-FR", "5 10").numbers).toEqual(["5", "10"]);
  });

  it("keeps_the_percent_sign_without_its_space", () => {
    expect(read("de-DE", "20 % Rabatt")).toEqual({
      numbers: ["20%"],
      spaced: [],
      rest: "  Rabatt",
    });
  });

  it("finds_nothing_in_text_without_digits", () => {
    expect(read("en-US", "No numbers")).toEqual({ numbers: [], spaced: [], rest: "No numbers" });
  });
});

describe("numbers in a pair", () => {
  it("a_dropped_percent_sign_is_a_finding", () => {
    expect(rows(checkNumbers(aPair("Save 30%", "Sparen Sie 30"), ctx()))).toEqual([["30%", "30"]]);
  });

  it("a_spaced_french_percentage_matches", () => {
    expect(rows(checkNumbers(aPair("30% off", "-30 %", "fr-FR"), ctx("fr-FR")))).toEqual([]);
  });

  it.each([
    ["de-DE", "Rufen Sie 0800 123 456 an"],
    ["fr-FR", "Appelez le 0800 123 456"],
  ])("a_phone_number_with_spaces_reads_alike_in_every_locale_%#", (locale, target) => {
    const r = checkNumbers(aPair("Call 0800 123 456", target, locale), ctx(locale));
    expect(r).toEqual({ applicable: true, findings: [] });
  });

  it("a_changed_phone_number_is_a_finding", () => {
    const r = checkNumbers(aPair("Call 0800 123 456", "Rufen Sie 0800 123 457 an"), ctx());
    expect(rows(r)).toEqual([["123456", "123457"]]);
  });
});

describe("plain spaces and percent words", () => {
  it("a_phone_number_with_spaces_matches_one_with_dashes", () => {
    expect(numberRows("Call 0800 123 456", "Rufen Sie 0800-123-456 an")).toEqual([]);
  });

  it.each([
    ["Save 30% today", "Sparen Sie heute 30 Prozent", "de-DE"],
    ["Save 30 percent today", "Sparen Sie heute 30 %", "de-DE"],
    ["Save 30% today", "\u672c\u65e530\u30d1\u30fc\u30bb\u30f3\u30c8\u30aa\u30d5", "ja-JP"],
    ["Save 30% today", "\u00c9conomisez 30 pour cent", "fr-FR"],
  ])("a_percent_word_is_a_percent_sign_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it("a_number_without_a_percent_word_still_differs", () => {
    expect(numberRows("Save 30% today", "Sparen Sie heute 30 Euro-Gutschein")).toEqual([
      ["30%", "30"],
    ]);
  });
});

describe("ratings and leftovers", () => {
  it("a_decimal_rating_is_numbers_not_a_slash_date", () => {
    const target = "Not\u00e9 4,5 sur 5 par nos clients";
    expect(numberRows("Rated 4.5/5 by customers", target, "fr-FR")).toEqual([]);
  });

  it.each([
    ["Rated 4.5/5", ["4.5", "5"]],
    ["Score 4.5/6", ["4.5", "6"]],
    ["Score 4.75/5", ["4.75", "5"]],
  ])("a_slash_after_a_decimal_is_a_rating_of_plain_numbers_%#", (text, numbers) => {
    const found = tokensOf("en-US", text);
    expect([found.slashes, found.numbers]).toEqual([[], numbers]);
  });

  it("a_german_decimal_rating_matches", () => {
    expect(dateRows("Rated 4.5/5", "Bewertet mit 4,5/5")).toEqual([[], [], []]);
  });

  it("a_broken_full_width_promo_code_leaves_no_number", () => {
    const target = "\u30b3\u30fc\u30c9\uff22\uff26\uff12\uff16";
    expect(numberRows("Code BF26", target, "ja-JP")).toEqual([]);
  });
});
