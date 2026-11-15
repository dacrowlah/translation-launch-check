import { describe, expect, it } from "vitest";
import { inLocale, tokensOf } from "../../support/builders.js";
import { extractNumbers } from "../../../src/domain/tokens/numbers.js";
import { numberRows } from "../../support/rows.js";

const CUSTOMERS = "Over 10,000 happy customers";

describe("a no-break space always groups digits", () => {
  it.each([
    ["Plus de 10\u00a0000 clients satisfaits", "fr-FR"],
    ["Plus de 10\u202f000 clients satisfaits", "fr-FR"],
    ["Plus de 10&nbsp;000 clients satisfaits", "fr-FR"],
    ["Plus de 10&#8239;000 clients satisfaits", "fr-FR"],
    ["\u00dcber 10\u00a0000 zufriedene Kunden", "de-DE"],
  ])("a_number_grouped_by_a_no_break_space_is_one_number_%#", (target, locale) => {
    expect(numberRows(CUSTOMERS, target, locale)).toEqual([]);
  });

  it("a_changed_number_grouped_by_a_no_break_space_is_a_finding", () => {
    expect(numberRows(CUSTOMERS, "Plus de 10\u00a0500 clients", "fr-FR")).toEqual([
      ["10000", "10500"],
    ]);
  });

  it("tokenize_keeps_the_group_through_nfkc", () => {
    const found = tokensOf("fr-FR", "1\u00a0299 pi\u00e8ces");
    expect(found.numbers).toEqual(["1299"]);
  });
});

describe("a plain space groups digits only when the other side has the whole number", () => {
  it.each([
    [CUSTOMERS, "Plus de 10 000 clients satisfaits", "fr-FR"],
    ["1,299 pieces in stock", "1 299 pi\u00e8ces en stock", "fr-FR"],
    ["Earn 2,500 points", "Gagnez 2 500 points", "fr-FR"],
    ["Earn 2,500 points", "Sammeln Sie 2 500 Punkte", "de-DE"],
  ])("a_spaced_number_matches_the_whole_number_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it("a_changed_spaced_number_with_no_part_opposite_is_read_whole", () => {
    expect(numberRows(CUSTOMERS, "Plus de 10 500 clients", "fr-FR")).toEqual([["10000", "10500"]]);
  });

  it("a_spaced_number_whose_whole_is_a_price_opposite_is_one_number", () => {
    const target = "Gagnez 10 000 dollars en 10 jours";
    expect(numberRows("Win $10,000 in 10 days", target, "fr-FR")).toEqual([[null, "10000"]]);
  });

  it.each([
    ["Gagnez 1\u00a0000 000 points", []],
    ["Gagnez 1 000\u202f000 points", []],
    ["Gagnez 1\u00a0000 500 points", [["1000000", "1000500"]]],
  ])("a_number_with_plain_and_no_break_spaces_is_one_group_%#", (target, expected) => {
    expect(numberRows("Win 1,000,000 points", target, "fr-FR")).toEqual(expected);
  });

  it("extracts_a_plain_space_group_as_whole_and_parts", () => {
    expect(inLocale(extractNumbers)("fr-FR", "1 299 pi\u00e8ces").spaced).toEqual([
      { joined: "1299", parts: ["1", "299"] },
    ]);
  });

  it("joins_a_spaced_number_as_often_as_the_other_side_holds_it", () => {
    const target = "10 000 clients ou 10 000 dans 10 villes";
    expect(numberRows("10,000 customers in 10 cities", target, "fr-FR")).toEqual([
      [null, "10"],
      [null, "000"],
    ]);
  });

  it.each([
    ["Top 5 100% cotton tees", "Top 5 T-Shirts aus 100 % Baumwolle"],
    ["Call 0800 123 456", "Rufen Sie 0800-123-456 an"],
    ["Get 2 100-piece puzzles", "2 Puzzles mit je 100 Teilen"],
    ["Pack of 6 250ml bottles", "6 Flaschen \u00e0 250 ml"],
  ])("neighbouring_numbers_stay_apart_%#", (master, target) => {
    expect(numberRows(master, target)).toEqual([]);
  });
});

describe("percent compounds and case", () => {
  it.each([
    ["Get a 20% voucher", "Holen Sie sich einen 20-Prozent-Gutschein"],
    ["20% discount", "20-prozentiger Rabatt"],
    ["20% discount", "20-%-Rabatt"],
    ["Save 30 Percent Today", "Sparen Sie heute 30 %"],
    ["SAVE 30 PERCENT", "30 % SPAREN"],
    ["Save 30%", "SPARE 30 PROZENT"],
  ])("a_compound_or_capitalized_percent_is_a_percent_%#", (master, target) => {
    expect(numberRows(master, target)).toEqual([]);
  });

  it.each([
    ["20% discount", "20-Rabatt", [["20%", "20"]]],
    ["30 Percent off", "30 Rabatt", [["30%", "30"]]],
  ])("a_number_without_a_percent_is_still_a_finding_%#", (master, target, expected) => {
    expect(numberRows(master, target)).toEqual(expected);
  });
});
