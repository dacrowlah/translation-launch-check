import { describe, expect, it } from "vitest";
import { extractMoney } from "../../../src/domain/tokens/money";
import { testLocale, testRules } from "../../support/rules";

const read = (locale: string, text: string) => extractMoney(text, testLocale(locale), testRules());

describe("extractMoney", () => {
  it.each([
    ["en-US", "USD 20", { minor: 2000, currency: "USD" }],
    ["en-US", "20 USD", { minor: 2000, currency: "USD" }],
    ["en-GB", "£9.99", { minor: 999, currency: "GBP" }],
    ["de-CH", "CHF 1'299.50", { minor: 129950, currency: "CHF" }],
    ["de-DE", "49,- €", { minor: 4900, currency: "EUR" }],
    ["de-DE", "5,5 €", { minor: 550, currency: "EUR" }],
  ])("reads_amounts_and_currencies %s %s", (locale, text, money) => {
    expect(read(locale, text).money).toEqual([money]);
  });

  it("keeps_cents_exact_where_floats_drift", () => {
    expect(read("en-US", "$1.15").money[0]?.minor).toBe(115);
  });

  it("leaves_a_bare_number_alone", () => {
    expect(read("en-US", "Save 20 today")).toEqual({ money: [], rest: "Save 20 today" });
  });

  it("replaces_each_price_with_one_space", () => {
    expect(read("en-US", "Now $50 only").rest).toBe("Now   only");
  });

  it("does_not_read_a_code_inside_a_word", () => {
    expect(read("en-US", "USDA 20").money).toEqual([]);
  });
});
