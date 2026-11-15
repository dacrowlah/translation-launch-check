import { describe, expect, it } from "vitest";
import {
  diffRows,
  multisetDiff,
  resultOf,
  unsureResult,
} from "../../../src/domain/checks/compare.js";
import { testRules } from "../../support/rules.js";

const lower = (item: string): string => item.toLowerCase();

describe("multisetDiff", () => {
  it("lists_what_each_side_holds_beyond_the_other_counting_repeats", () => {
    expect(multisetDiff(["a", "a", "b"], ["a", "c"])).toEqual({
      missing: ["a", "b"],
      extra: ["c"],
    });
  });
  it("finds_nothing_in_two_empty_lists", () => {
    expect(multisetDiff([], [])).toEqual({ missing: [], extra: [] });
  });
  it("reads_frozen_lists_without_changing_them", () => {
    const [a, b] = [Object.freeze(["x", "y", "x"]), Object.freeze(["x"])];
    expect(multisetDiff(a, b)).toEqual({ missing: ["y", "x"], extra: [] });
    expect([a, b]).toEqual([["x", "y", "x"], ["x"]]);
  });
  it("compares_by_key_and_keeps_the_items_as_written", () => {
    expect(multisetDiff(["A", "B", "b"], ["a", "b", "C"], lower)).toEqual({
      missing: ["b"],
      extra: ["C"],
    });
  });
});

describe("diffRows", () => {
  it("pairs_a_missing_item_with_an_extra_one_by_position", () => {
    expect(diffRows(["1", "2", "3"], ["1", "4"])).toEqual([
      ["2", "4"],
      ["3", undefined],
    ]);
  });
});

describe("resultOf", () => {
  const spec = { check: "numbers", detail: "A number differs from the master." } as const;
  it("drops_the_rows_of_a_check_that_does_not_apply", () => {
    expect(resultOf(testRules(), spec, false, [["1", "2"]])).toEqual({
      applicable: false,
      findings: [],
    });
  });
  it("turns_each_row_of_an_applicable_check_into_a_finding", () => {
    expect(resultOf(testRules(), spec, true, [["1", undefined]]).findings).toEqual([
      { ...spec, severity: "blocker", confidence: "certain", expected: "1", found: null },
    ]);
  });
});

describe("unsureResult", () => {
  const spec = { check: "currency_code", detail: "Is the price there?" } as const;
  it("makes_one_applicable_unsure_finding_from_a_row", () => {
    const rules = { ...testRules(), unsure_severity: "info" as const };
    expect(unsureResult(rules, spec, ["JPY", undefined])).toEqual({
      applicable: true,
      findings: [{ ...spec, severity: "info", confidence: "unsure", expected: "JPY", found: null }],
    });
  });
});
