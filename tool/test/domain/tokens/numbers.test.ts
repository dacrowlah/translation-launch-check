import { describe, expect, it } from "vitest";
import { extractNumbers } from "../../../src/domain/tokens/numbers";
import { testLocale } from "../../support/rules";

const read = (locale: string, text: string) => extractNumbers(text, testLocale(locale));

describe("extractNumbers", () => {
  it.each([
    ["en-US", "1,299 items", ["1299"]],
    ["en-US", "9.99 and 3", ["9.99", "3"]],
    ["de-DE", "1.299,50 Stk", ["1299.5"]],
    ["de-DE", "12,50 %", ["12.5"]],
    ["en-US", "12.5%", ["12.5"]],
    ["en-US", "20.00 off", ["20"]],
    ["en-US", "100.0 and 10.05", ["100", "10.05"]],
    ["de-CH", "1'299 Stk", ["1299"]],
    ["fr-FR", "1 299 pi\u00e8ces", ["1299"]],
    ["en-US", "2026 plans", ["2026"]],
  ])("normalizes_separators %s %s", (locale, text, numbers) => {
    expect(read(locale, text).numbers).toEqual(numbers);
  });

  it("does_not_group_a_space_before_a_short_number", () => {
    expect(read("fr-FR", "5 10").numbers).toEqual(["5", "10"]);
  });

  it("drops_the_percent_sign_with_its_space", () => {
    expect(read("de-DE", "20 % Rabatt")).toEqual({ numbers: ["20"], rest: "  Rabatt" });
  });

  it("finds_nothing_in_text_without_digits", () => {
    expect(read("en-US", "No numbers")).toEqual({ numbers: [], rest: "No numbers" });
  });
});
