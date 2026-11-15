import { describe, expect, it } from "vitest";
import { usualTimes } from "../../../src/domain/tokens/resolve-twelves";
import { tokensOf } from "../../support/builders";
import { numberRows } from "../../support/rows";

const jaRows = (master: string, target: string) => numberRows(master, target, "ja-JP");
const LUNCH = "\u30e9\u30f3\u30c1\u5348\u5f8c12\u6642\uff5e1\u6642";
const DINNER = "\u30c7\u30a3\u30ca\u30fc\u5348\u524d0\u6642\u307e\u3067";

describe("a japanese twelve takes the reading the other side still has room for", () => {
  it.each([
    ["Open 12 PM - 12 AM", "\u5348\u5f8c12\u6642\uff5e\u5348\u524d0\u6642"],
    ["Sale 12 AM - 12 PM", "\u5348\u524d0\u6642\uff5e\u5348\u5f8c12\u6642"],
    [
      "Starts at midnight, ends at noon",
      "\u5348\u524d0\u6642\u958b\u59cb\u3001\u5348\u5f8c12\u6642\u7d42\u4e86",
    ],
    ["Lunch 12-1 PM, dinner until 12 AM", `${LUNCH}\u3001${DINNER}`],
  ])("a_twelve_beside_a_matched_midnight_reads_as_noon_%#", (master, target) => {
    expect(jaRows(master, target)).toEqual([]);
  });

  it("a_changed_time_beside_a_twelve_is_a_finding", () => {
    const target = "\u5348\u5f8c12\u6642\uff5e\u5348\u524d0\u6642";
    expect(jaRows("Open 12 PM - 1 AM", target)).toEqual([["01:00", "00:00"]]);
  });
});

describe("every twelve of a side follows one convention", () => {
  it.each([
    ["12 PM and 12 AM", "\u5348\u5f8c12\u6642\u3068\u5348\u5f8c12\u6642", [["12:00", "00:00"]]],
    ["12 PM and 12 AM", "\u5348\u524d12\u6642\u3068\u5348\u524d12\u6642", [["00:00", "12:00"]]],
    [
      "Ends 12 PM, ships 12 AM",
      "\u5348\u524d12\u6642\u307e\u3067\u3001\u5348\u524d12\u6642\u767a\u9001",
      [["00:00", "12:00"]],
    ],
  ])("one_twelve_written_for_noon_and_midnight_is_a_finding_%#", (master, target, rows) => {
    expect(jaRows(master, target)).toEqual(rows);
  });

  it("two_twelves_that_fit_the_second_convention_match", () => {
    expect(jaRows("12 PM and 12 PM", "\u5348\u5f8c12\u6642\u3068\u5348\u5f8c12\u6642")).toEqual([]);
  });
});

describe("a range end carried from a twelve follows the twelve's reading", () => {
  it.each([
    ["Open 12-6am", "\u5348\u524d12\u6642\uff5e6\u6642"],
    ["Open 12am-1am", "\u5348\u5f8c12\u6642\uff5e1\u6642"],
    ["Lunch 12-1 PM", "\u5348\u5f8c12\u6642\uff5e1\u6642"],
    ["Open 12-6pm", "\u5348\u524d12\u6642\uff5e6\u6642"],
  ])("both_ends_of_a_range_from_a_twelve_match_either_reading_%#", (master, target) => {
    expect(jaRows(master, target)).toEqual([]);
  });

  it("a_changed_end_after_a_twelve_is_a_finding", () => {
    expect(jaRows("Open 12-6am", "\u5348\u524d12\u6642\uff5e7\u6642")).toEqual([
      ["06:00", "07:00"],
    ]);
  });

  it("a_changed_end_reads_in_the_convention_under_which_more_values_fit", () => {
    expect(jaRows("Open 12-6 PM", "\u5348\u5f8c12\u6642\uff5e7\u6642")).toEqual([
      ["18:00", "19:00"],
    ]);
  });
});

describe("a morning range to twelve ends at noon in the language's own reading", () => {
  it("reads_a_japanese_morning_range_to_twelve_as_eleven_to_noon", () => {
    const range = tokensOf("ja-JP", "11\u6642\uff5e\u5348\u524d12\u6642");
    expect([range.times, range.twelves]).toEqual([["11:00", "12:00"], []]);
  });

  it("a_japanese_range_to_twelve_matches_eleven_to_noon", () => {
    expect(jaRows("Open 11 AM - 12 PM", "11\u6642\uff5e\u5348\u524d12\u6642")).toEqual([]);
  });

  it("a_japanese_range_to_twelve_opposite_one_pm_is_a_finding", () => {
    expect(jaRows("Open 11 AM - 1 PM", "11\u6642\uff5e\u5348\u524d12\u6642")).toEqual([
      ["13:00", "12:00"],
    ]);
  });

  it.each([
    ["Open 11am-12am", "Ge\u00f6ffnet 11-24 Uhr", "de-DE"],
    ["Open 10am-12am daily", "Tous les jours de 10 h \u00e0 minuit", "fr-FR"],
    ["Open 11am-12am", "\u5348\u524d11\u6642\uff5e\u5348\u524d0\u6642", "ja-JP"],
    ["Open 11am-12am", "Open 11am-midnight", "en-GB"],
  ])("an_explicit_morning_start_to_twelve_am_ends_at_midnight_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it("an_explicit_morning_start_to_twelve_am_opposite_noon_is_a_finding", () => {
    expect(numberRows("Open 10am-12am", "T\u00e4glich 10-12 Uhr")).toEqual([["00:00", "12:00"]]);
  });

  it("known_limitation_an_evening_range_to_twelve_am_reads_as_morning", () => {
    expect(numberRows("Happy hour 5-12am", "Happy Hour 17-24 Uhr")).toEqual([
      ["05:00", "17:00"],
      ["12:00", "00:00"],
    ]);
  });
});

describe("usualTimes", () => {
  it("lists_each_twelve_by_its_default_reading", () => {
    const { twelves } = tokensOf("ja-JP", "\u5348\u524d12\u6642\uff5e6\u6642");
    expect(usualTimes(twelves)).toEqual(["12:00", "18:00"]);
  });
});
