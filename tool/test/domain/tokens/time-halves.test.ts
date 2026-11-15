import { describe, expect, it } from "vitest";
import { timesIn } from "../../support/builders.js";
import { numberRows } from "../../support/rows.js";

describe("the half of the day at either end of a range", () => {
  it.each([
    ["Open 11am-1pm", "\u5348\u524d11\u6642\uff5e1\u6642"],
    ["Open 10am-6pm", "\u5348\u524d10\u6642\uff5e6\u6642"],
    ["Open 11pm-1am", "\u5348\u5f8c11\u6642\uff5e1\u6642"],
  ])("a_carried_half_that_would_end_before_the_start_flips_%#", (master, target) => {
    expect(numberRows(master, target, "ja-JP")).toEqual([]);
  });

  it.each([
    ["Open 12-6am", ["00:00", "06:00"]],
    ["Open 9-11am", ["09:00", "11:00"]],
    ["Open 10-2am", ["22:00", "02:00"]],
  ])("a_bare_start_before_an_am_end_takes_the_half_that_keeps_it_first_%#", (text, expected) => {
    expect(timesIn("en-US", text)).toEqual(expected);
  });

  it.each([
    ["Open 11-12am", ["11:00", "12:00"]],
    ["Brunch 10-12am", ["10:00", "12:00"]],
    ["Open 8-12am", ["08:00", "12:00"]],
    ["Brunch 10:30-12am", ["10:30", "12:00"]],
  ])("a_morning_range_to_twelve_am_ends_at_noon_%#", (text, expected) => {
    expect(timesIn("en-US", text)).toEqual(expected);
  });

  it.each([
    ["Open 11-12am", "Ge\u00f6ffnet 11-12 Uhr"],
    ["Brunch 10-12am", "Brunch 10-12 Uhr"],
  ])("a_morning_range_to_twelve_am_matches_one_to_noon_%#", (master, target) => {
    expect(numberRows(master, target)).toEqual([]);
  });

  it("a_late_range_opposite_a_morning_one_to_twelve_am_is_a_finding", () => {
    expect(numberRows("Open 11-12am", "Ge\u00f6ffnet 23-24 Uhr")).toEqual([
      ["11:00", "23:00"],
      ["12:00", "00:00"],
    ]);
  });
});

describe("twelve o'clock in Japanese reads either way", () => {
  it.each([
    ["\u5348\u524d12\u6642", ["12:00"]],
    ["\u5348\u5f8c12\u6642", ["00:00"]],
    ["\u5348\u524d0\u6642", ["00:00"]],
    ["\u5348\u5f8c0\u6642", ["12:00"]],
  ])("reads_twelve_by_the_rules_default_when_alone_%#", (text, expected) => {
    expect(timesIn("ja-JP", text)).toEqual(expected);
  });

  it.each([
    ["Ends 12 PM", "\u5348\u524d12\u6642\u307e\u3067"],
    ["Ends 12 AM", "\u5348\u524d12\u6642\u307e\u3067"],
    ["Ends midnight", "\u5348\u524d12\u6642\u307e\u3067"],
    ["Ends 12 PM", "\u5348\u5f8c12\u6642\u307e\u3067"],
    ["Ends 12 AM", "\u5348\u5f8c12\u6642\u307e\u3067"],
    ["Lunch 12:30 PM", "\u30e9\u30f3\u30c1\u5348\u5f8c12\u664230\u5206"],
    ["Open 12-6pm", "\u55b6\u696d\u6642\u9593 \u5348\u5f8c12\u6642\uff5e6\u6642"],
    ["Open 10am-12pm", "\u5348\u524d10\u6642\uff5e\u5348\u5f8c12\u6642"],
    ["Open 8pm-midnight", "\u5348\u5f8c8\u6642\uff5e12\u6642"],
    ["Ends 12 noon", "\u6b63\u5348\uff08\u5348\u5f8c12\u6642\uff09\u307e\u3067"],
  ])("a_japanese_twelve_matches_the_english_time_either_way_%#", (master, target) => {
    expect(numberRows(master, target, "ja-JP")).toEqual([]);
  });

  it.each([
    ["Ends 1 PM", "\u5348\u524d12\u6642\u307e\u3067"],
    ["Ends 1 PM", "\u5348\u5f8c12\u6642\u307e\u3067"],
  ])("a_japanese_twelve_with_no_reading_opposite_reads_as_the_nearer_time_%#", (master, target) => {
    expect(numberRows(master, target, "ja-JP")).toEqual([["13:00", "12:00"]]);
  });

  it("a_japanese_twelve_with_no_time_opposite_keeps_the_default", () => {
    expect(numberRows("Ends soon", "\u5348\u5f8c12\u6642\u307e\u3067", "ja-JP")).toEqual([
      [null, "00:00"],
    ]);
  });
});

describe("a time word right after a hyphen ends a range", () => {
  it.each([
    ["Open 10am-noon", "Ge\u00f6ffnet 10-12 Uhr"],
    ["Open 9pm-midnight", "Ge\u00f6ffnet 21-24 Uhr"],
  ])("a_range_to_a_time_word_matches_%#", (master, target) => {
    expect(numberRows(master, target)).toEqual([]);
  });

  it("reads_a_time_word_after_a_time_and_a_hyphen", () => {
    expect(timesIn("en-US", "Open 10am-noon")).toEqual(["10:00", "12:00"]);
  });
});
