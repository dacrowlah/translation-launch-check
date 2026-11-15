import { describe, expect, it } from "vitest";
import { numberRows } from "../../support/rows";

describe("a clock time may end before a colon", () => {
  it.each([
    ["Ends 8 PM: shop now", "Endet 20 Uhr: jetzt shoppen", "de-DE"],
    ["Ends 8 PM: shop now", "Fin \u00e0 20 h : achetez", "fr-FR"],
    ["Ends 11:59 PM: last chance", "Endet 23:59 Uhr: letzte Chance", "de-DE"],
  ])("a_time_before_a_colon_is_a_time_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it("a_changed_time_before_a_colon_is_a_finding", () => {
    expect(numberRows("Ends 8 PM: shop now", "Endet 21 Uhr: jetzt shoppen")).toEqual([
      ["20:00", "21:00"],
    ]);
  });

  it("a_colon_before_a_digit_still_belongs_to_the_time", () => {
    expect(numberRows("Opens 8:30", "\u00d6ffnet 8:45")).toEqual([["08:30", "08:45"]]);
  });
});

describe("split opening hours outside Fr. are times", () => {
  it.each([
    ["Mon-Fri 9am-12pm, 2-6pm", "Mo.\u2013Fr. 9\u201312, 14\u201318 Uhr", "de-DE"],
    ["Sat 9am-12pm, 1-4pm", "Sa. 9\u201312, 13\u201316 Uhr", "de-DE"],
    ["Open 9am-12pm, 2-6pm", "Ouvert 9-12, 14-18 h", "fr-FR"],
    ["Open 9am-12pm, 2-6pm", "\u55b6\u696d9\uff5e12\u300114\uff5e18\u6642", "ja-JP"],
  ])("both_ranges_of_split_hours_read_as_times_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it("a_changed_end_of_a_japanese_split_range_is_one_time_finding", () => {
    const target = "\u55b6\u696d9\uff5e13\u300114\uff5e18\u6642";
    expect(numberRows("Open 9am-12pm, 2-6pm", target, "ja-JP")).toEqual([["12:00", "13:00"]]);
  });

  it("a_changed_end_of_the_first_split_range_is_one_time_finding", () => {
    const target = "Mo.\u2013Fr. 9\u201313, 14\u201318 Uhr";
    expect(numberRows("Mon-Fri 9am-12pm, 2-6pm", target)).toEqual([["12:00", "13:00"]]);
  });
});
