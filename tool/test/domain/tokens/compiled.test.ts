import { describe, expect, it } from "vitest";
import type { Rules } from "../../../src/domain/rules.js";
import { compile } from "../../../src/domain/tokens/compiled.js";
import { tokenize } from "../../../src/domain/tokens/tokenize.js";
import { testLocale, testRules } from "../../support/rules.js";

const read = (rules: Rules, locale: string, text: string) => {
  const found = tokenize(text, testLocale(locale), rules);
  return { dates: found.dates, money: found.money };
};
const GERMAN = { dates: [{ month: 11, day: 27, year: null, weekday: 4 }], money: [] };
const SWISS = { dates: [], money: [{ amount: "12.1", currency: "CHF" }] };

describe("patterns compiled per locale", () => {
  it("the_test_rules_are_one_instance", () => {
    expect(testRules()).toBe(testRules());
  });

  it("compiles_once_per_rules_object_and_locale_object", () => {
    const [rules, other] = [{ ...testRules() }, { ...testRules() }];
    const de = testLocale("de-DE");
    expect([
      compile(de, rules) === compile(de, rules),
      compile(de, rules) === compile(de, other),
    ]).toEqual([true, false]);
  });

  it("de_ch_does_not_reuse_the_de_de_patterns", () => {
    const rules = { ...testRules() };
    expect(read(rules, "de-DE", "Fr. 27.11.")).toEqual(GERMAN);
    expect(read(rules, "de-CH", "Fr. 12.10.")).toEqual(SWISS);
  });

  it("de_de_does_not_reuse_the_de_ch_patterns", () => {
    const rules = { ...testRules() };
    expect(read(rules, "de-CH", "Fr. 12.10.")).toEqual(SWISS);
    expect(read(rules, "de-DE", "Fr. 27.11.")).toEqual(GERMAN);
  });
});
