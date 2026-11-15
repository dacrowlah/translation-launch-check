import { describe, expect, it } from "vitest";
import { tokensOf } from "../../support/builders";
import { numberRows } from "../../support/rows";

describe("a percent sign written once after a range covers both ends", () => {
  it.each([
    ["Save 20% to 50%", "Sparen Sie 20 bis 50 %", "de-DE"],
    ["Save 20%-50%", "Sparen Sie 20-50 %", "de-DE"],
    ["Save 20% to 50%", "Sparen Sie 20 bis 50 Prozent", "de-DE"],
    ["Save 20% to 50% off", "\u00c9conomisez de 20 \u00e0 50 %", "fr-FR"],
    ["20% to 50% off", "20\uff5e50%\u30aa\u30d5", "ja-JP"],
    ["20% to 50% off", "20 to 50% off", "en-GB"],
    ["Save 20-50%", "Sparen Sie 20 % bis 50 %", "de-DE"],
    ["Save 20-50%", "\u00c9conomisez de 20 % \u00e0 50 %", "fr-FR"],
    ["Save 20-50%", "20%\uff5e50%\u30aa\u30d5", "ja-JP"],
  ])("a_range_with_one_percent_sign_matches_both_signs_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it.each([
    [
      "Save 20% to 50%",
      "Sparen Sie 20 bis 50 Rabatt",
      [
        ["20%", "20"],
        ["50%", "50"],
      ],
    ],
    ["Save 20% to 50%", "Sparen Sie 20 bis 60 %", [["50%", "60%"]]],
    ["Sizes 8 to 10, 30% off", "Gr\u00f6\u00dfen 8 bis 10, 30 % Rabatt", []],
  ])("a_percent_sign_only_carries_back_over_a_connector_%#", (master, target, expected) => {
    expect(numberRows(master, target)).toEqual(expected);
  });

  it("known_limitation_a_japanese_wari_percentage_reads_as_its_digit", () => {
    expect(numberRows("Save 20%", "2\u5272\u5f15\u304d", "ja-JP")).toEqual([["20%", "2"]]);
  });
});

describe("only a real range carries the sign back", () => {
  it.each([
    ["Cyber Monday 2026 \u2013 30% off", "Cyber Monday 2026 \u2013 30 % Rabatt", "de-DE"],
    ["Cyber Monday 2026: 30% off", "Cyber Monday 2026 \u2013 30 % Rabatt", "de-DE"],
    ["Cyber Monday 2026 \u2013 30% off", "Cyber Monday 2026 : 30 % de remise", "fr-FR"],
    ["Top 5 \u2013 50%", "Top 5 \u2013 50 %", "de-DE"],
    ["Top 5 deals: 50% off", "Top 5 \u2013 50 % Rabatt", "de-DE"],
    ["Pack of 3, 30% off", "Lot de 3 -30 %", "fr-FR"],
    ["Pack of 3: 30% off", "Lot de 3 - 30 %", "fr-FR"],
    ["Day 1: 20% off", "Tag 1 \u2013 20 % Rabatt", "de-DE"],
    ["Sizes 36 to 42: 20% off", "Gr\u00f6\u00dfen 36 bis 42 \u2013 20 % Rabatt", "de-DE"],
    ["Model 3: 20% off", "Modell 3 - 20 % Rabatt", "de-DE"],
    ["2 for 20% off", "2 und 20 % Rabatt", "de-DE"],
    ["Buy 2 and save 20%", "Kaufen Sie 2 und 20 % sparen", "de-DE"],
    ["Buy 2, get 50% off", "Achetez-en 2 - 50 % sur le second", "fr-FR"],
    ["Between 20% and 50% off", "Zwischen 20 und 50 % Rabatt", "de-DE"],
    ["Save 20%-50%", "Sparen Sie 20\u201350 %", "de-DE"],
  ])("a_number_before_a_separator_keeps_no_sign_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it.each([
    ["20 bis 50 %", ["20%", "50%"]],
    ["50 bis 20 %", ["50", "20%"]],
    ["20 - 50 %", ["20", "50%"]],
  ])("carries_the_sign_only_to_a_smaller_start_over_a_connector_%#", (text, numbers) => {
    expect(tokensOf("de-DE", text).numbers).toEqual(numbers);
  });

  it("a_changed_discount_after_a_separator_is_a_finding", () => {
    expect(numberRows("Top 5 \u2013 50 %", "Top 5 \u2013 40 %")).toEqual([["50%", "40%"]]);
  });

  it.each([
    ["Save 20-50%", "Sparen Sie 20 \u2013 50 %", "de-DE", [["20%", "20"]]],
    ["Save 20-50%", "\u00c9conomisez 20 - 50 %", "fr-FR", [["20%", "20"]]],
    ["Save 20 - 50%", "Sparen Sie 20-50 %", "de-DE", [["20", "20%"]]],
  ])("known_limitation_a_spaced_range_dash_carries_no_sign_%#", (master, target, locale, rows) => {
    expect(numberRows(master, target, locale)).toEqual(rows);
  });

  it("known_limitation_a_number_before_a_to_word_and_a_discount_takes_its_sign", () => {
    const target = "1 achet\u00e9 = 1 \u00e0 50 %";
    expect(numberRows("Buy 1, get 1 at 50% off", target, "fr-FR")).toEqual([["1", "1%"]]);
  });
});
