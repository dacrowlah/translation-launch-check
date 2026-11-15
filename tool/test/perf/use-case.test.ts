import { describe, expect, it } from "vitest";
import { checkLocalization } from "../../src/application/check-localization";
import { aLine, aPackage } from "../support/builders";
import { FakeClock } from "../support/clock";
import { FakeLanguageDetector } from "../support/language-detector";
import { testRules } from "../support/rules";
import { cpuMs, growth, LINEAR_GROWTH, SCALING_TIMEOUT } from "../support/scaling";

const LOCALES = ["de-DE", "fr-FR", "ja-JP", "en-GB", "de-CH"];
/** A package of `count` lines, the master and 5 targets, with the cells `cellOf(i)`. */
const packageOf = (count: number, cellOf: (i: number) => string) => {
  const lineOf = (i: number) =>
    aLine({
      id: `L${i}`,
      texts: Object.fromEntries(["en-US", ...LOCALES].map((l) => [l, cellOf(i)])),
    });
  return aPackage({ locales: LOCALES, lines: Array.from({ length: count }, (_, i) => lineOf(i)) });
};
const check = (count: number, cellOf: (i: number) => string) =>
  checkLocalization(packageOf(count, cellOf), {
    rules: testRules(),
    clock: new FakeClock(),
    detector: new FakeLanguageDetector({}),
  });

const spaces = (n: number) => " ".repeat(n);
/** A run of units, cut to about 4 characters per n: 1000 characters at n = BOUND. */
const units = (unit: string, n: number) => unit.repeat(Math.ceil((n * 4) / unit.length));
const MIXED = "\u5348\u5f8c12\u6642\uff5e\u5348\u524d0\u6642 20-50% Black Friday - $5 Fr. 9 Uhr ";

const BOUND = 250;
/** Number-like cells are measured from twice the bound: a numbers-stage quadratic shows there. */
const NUMBERS = 2 * BOUND;
/** A full package at the bound takes about 0.6 s of CPU; 8 s is over ten times that. */
const PACKAGE_CPU_MS = 8_000;

/**
 * Hostile cells of n units each, and the n growth is measured from: at n = BOUND a cell is
 * about 1000 characters, the contract's cell bound. Growth runs from there to 4 times, so the
 * fixed work of a package does not hide a quadratic stage (one over the whole text that makes
 * a bound-sized package 1.2 times slower fails; one in the numbers stage that makes a
 * number-heavy package 3 times slower fails through the number-like cells).
 */
const CELLS: [string, (n: number) => string, number][] = [
  ["closer_runs", (n) => `https://a.b/${")".repeat(n * 4)}`, BOUND],
  ["slash_forms", (n) => units("1/2 ", n), NUMBERS],
  ["numbers", (n) => units("1 ", n), NUMBERS],
  ["plain_space_groups", (n) => units("1 000 ", n), NUMBERS],
  ["weekday_range_spaces", (n) => `Mo.${spaces(n * 2)}\u2013${spaces(n * 2)}Fr. 9 Uhr`, BOUND],
  ["currency_spaces", (n) => `Fr.${spaces(n * 4)}9 Uhr`, BOUND],
  ["percent_range_spaces", (n) => `between 1${spaces(n * 4)}and 2%`, BOUND],
  ["twelves_percents_and_currencies", (n) => units(MIXED, n), NUMBERS],
  ["digits_after_a_multiplier", (n) => `1\u4e07${"1".repeat(n * 4)}x`, BOUND],
];

describe("the use case scales linearly with the cell size", () => {
  it.each(CELLS)(
    "checks_cells_of_four_times_as_many_hostile_units_in_about_four_times_the_time_%#",
    (_name, cellOf, from) => {
      expect(growth((n) => check(5, () => cellOf(n)), from)).toBeLessThan(LINEAR_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  it(
    "checks_a_full_package_of_hostile_cells_at_the_contract_bound",
    () => {
      const cells = (i: number) => CELLS[i % CELLS.length]?.[1](BOUND) ?? "";
      const used = cpuMs(() => {
        const report = check(50, cells);
        expect(report.locales.map((l) => l.status)).toEqual(LOCALES.map(() => "checked"));
      });
      expect(used).toBeLessThan(PACKAGE_CPU_MS);
    },
    SCALING_TIMEOUT,
  );
});
