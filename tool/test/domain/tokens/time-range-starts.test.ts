import { describe, expect, it } from "vitest";
import { timesIn, tokensOf } from "../../support/builders.js";
import { numberRows } from "../../support/rows.js";

const valuesOf = (locale: string, text: string) => {
  const found = tokensOf(locale, text);
  return { money: found.money, numbers: found.numbers, times: timesIn(locale, text) };
};

describe("a range whose start is no time leaves the time after it", () => {
  it.each([
    ["Free shipping on orders over 50 until 2 PM", "Gratisversand ab 50 bis 14 Uhr", "de-DE"],
    ["Save 30 until 8 PM", "Sparen Sie 30 bis 20 Uhr", "de-DE"],
    ["Code 99 and 8 PM", "Code 99 und 20 Uhr", "de-DE"],
    ["Orders over 50 by 2 PM", "Commandes de plus de 50 \u00e0 14 h", "fr-FR"],
    ["Only 29.99 until 8 PM", "Nur 29.99 bis 20 Uhr", "de-CH"],
    ["Only 9.50 until 8 PM", "Nur 9.50 bis 20 Uhr", "de-CH"],
    ["Only CHF 9.50 until 8 PM", "Nur CHF 9.50 bis 20 Uhr", "de-CH"],
  ])("a_number_before_a_range_connector_and_a_time_is_no_finding_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it("reads_a_number_and_the_time_after_it", () => {
    expect(valuesOf("de-DE", "ab 50 bis 14 Uhr")).toEqual({
      money: [],
      numbers: ["50"],
      times: ["14:00"],
    });
  });

  it.each([
    ["Nur CHF 9.50 bis 20 Uhr", { amount: "9.5", currency: "CHF" }, ["20:00"]],
    ["Fr. 29.99 bis 23:59 Uhr", { amount: "29.99", currency: "CHF" }, ["23:59"]],
  ])("a_price_before_a_range_connector_is_money_%#", (text, money, times) => {
    expect(valuesOf("de-CH", text)).toEqual({ money: [money], numbers: [], times });
  });

  it("a_twelve_hour_start_past_twelve_leaves_the_end", () => {
    expect(timesIn("en-US", "Save 13-5pm")).toEqual(["17:00"]);
  });

  it("a_changed_time_after_a_number_is_a_finding", () => {
    const target = "Gratisversand ab 50 bis 15 Uhr";
    expect(numberRows("Free shipping over 50 until 2 PM", target)).toEqual([["14:00", "15:00"]]);
  });
});
