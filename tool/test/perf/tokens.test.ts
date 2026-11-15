import { describe, expect, it } from "vitest";
import { visibleText } from "../../src/domain/checks/spans.js";
import { resolvePair } from "../../src/domain/tokens/resolve-pair.js";
import { extractMoney } from "../../src/domain/tokens/money.js";
import { takeWith } from "../../src/domain/tokens/take.js";
import { tokensOf } from "../support/builders.js";
import { testLocale, testRules } from "../support/rules.js";
import { growth, LINEAR_GROWTH, SCALING_TIMEOUT } from "../support/scaling.js";

describe("token readers scale linearly", () => {
  it(
    "takes_four_times_as_many_matches_in_about_four_times_the_time",
    () => {
      const take = (n: number) => takeWith("1 ".repeat(n), /\d/gu, (m) => m[0]);
      expect(growth(take, 5000)).toBeLessThan(LINEAR_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  it.each([
    ["a_cell_of_tags", (n: number) => "<i>".repeat(n)],
    ["letters_before_an_at_sign", (n: number) => `${"a".repeat(n)}@`],
    ["dotted_digits", (n: number) => "1.".repeat(n)],
  ])(
    "reads_a_four_times_longer_hostile_cell_in_about_four_times_the_time_%#",
    (_name, textOf) => {
      const visible = (n: number) => visibleText(textOf(n), testRules());
      expect(growth(visible, 2500)).toBeLessThan(LINEAR_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});

describe("money reads multiplier text linearly", () => {
  it(
    "reads_a_four_times_longer_multiplier_chain_in_about_four_times_the_time",
    () => {
      const read = (n: number) =>
        extractMoney("1\u4e072\u5343".repeat(n), testLocale("ja-JP"), testRules());
      expect(growth(read, 250)).toBeLessThan(LINEAR_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  it(
    "reads_a_four_times_longer_digit_run_after_a_multiplier_in_about_four_times_the_time",
    () => {
      const read = (n: number) => tokensOf("ja-JP", `1\u4e07${"1".repeat(n)}x`);
      expect(growth(read, 250)).toBeLessThan(LINEAR_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});

describe("resolving a pair scales linearly", () => {
  const spaced = (n: number) => ({
    ...tokensOf("fr-FR", ""),
    spaced: Array.from({ length: n }, () => ({ joined: "1000", parts: ["1", "000"] })),
  });
  const candidates = (n: number) => ({
    ...tokensOf("fr-FR", ""),
    candidates: Array.from({ length: n }, (_, i) => ({ time: `${i}`, numbers: [`${i}`] })),
  });

  it.each([
    ["plain_space_groups", spaced],
    ["candidate_times", candidates],
  ])(
    "resolves_four_times_as_many_groups_or_candidates_in_about_four_times_the_time_%#",
    (_name, sideOf) => {
      const resolveOf = (n: number) => resolvePair(sideOf(n), sideOf(n));
      expect(growth(resolveOf, 2500)).toBeLessThan(LINEAR_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
