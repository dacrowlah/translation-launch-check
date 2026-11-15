import { describe, expect, it } from "vitest";
import { parseRules } from "../../src/infrastructure/rules-schema.js";
import { rawRules } from "../support/rules.js";

const withMultipliers = (multipliers: unknown) =>
  parseRules({ ...rawRules(), number_multipliers: multipliers });

describe("number_multipliers in rules.json", () => {
  it("accepts_powers_of_ten", () => {
    const multipliers = { ja: { "\u4e07": 10000, "\u5343": 1000 } };
    expect(withMultipliers(multipliers).number_multipliers).toEqual(multipliers);
  });

  it.each([[{ ja: { x: 12 } }], [{ ja: { x: 1 } }], [{ ja: { x: 0.1 } }], [{ ja: { "": 10 } }]])(
    "rejects_a_multiplier_that_is_no_power_of_ten_or_has_no_name_%#",
    (multipliers) => {
      expect(() => withMultipliers(multipliers)).toThrow(/number_multipliers/);
    },
  );
});

describe("number_multiplier_blockers in rules.json", () => {
  it("accepts_a_list_of_words_per_language", () => {
    const blockers = { ja: ["\u4e8c", "\u6570"] };
    const rules = parseRules({ ...rawRules(), number_multiplier_blockers: blockers });
    expect(rules.number_multiplier_blockers).toEqual(blockers);
  });

  it("rejects_an_empty_blocker", () => {
    const rules = { ...rawRules(), number_multiplier_blockers: { ja: [""] } };
    expect(() => parseRules(rules)).toThrow(/number_multiplier_blockers/);
  });
});

describe("time_split_separators in rules.json", () => {
  it("accepts_a_list_of_signs_per_language", () => {
    const separators = { ja: [",", "\u3001"] };
    const rules = parseRules({ ...rawRules(), time_split_separators: separators });
    expect(rules.time_split_separators).toEqual(separators);
  });

  it("rejects_an_empty_separator", () => {
    const rules = { ...rawRules(), time_split_separators: { ja: [""] } };
    expect(() => parseRules(rules)).toThrow(/time_split_separators/);
  });
});
