import { describe, expect, it } from "vitest";
import { extractPromoCodes } from "../../../src/domain/tokens/promo-codes";
import { testRules } from "../../support/rules";

describe("extractPromoCodes", () => {
  it("finds_promo_codes_but_not_words", () => {
    expect(extractPromoCodes("Code BF30 or CYBER25, not Sale", testRules()).codes).toEqual([
      "BF30",
      "CYBER25",
    ]);
  });

  it("replaces_each_code_with_one_space", () => {
    expect(extractPromoCodes("Use BF30 now", testRules()).rest).toBe("Use   now");
  });

  it("ignores_uppercase_words_without_digits", () => {
    expect(extractPromoCodes("SALE and BF30", testRules()).codes).toEqual(["BF30"]);
  });
});
