import { describe, expect, it } from "vitest";
import { timesIn } from "../../support/builders.js";
import { numberRows } from "../../support/rows.js";

describe("time ranges share the last time's suffix", () => {
  it.each([
    ["Open 9am-5pm", "Ge\u00f6ffnet 9-17 Uhr", "de-DE"],
    ["Open 10am to 6pm", "Ge\u00f6ffnet von 10 bis 18 Uhr", "de-DE"],
    ["Open 10am-6pm", "10\uff5e18\u6642\u55b6\u696d", "ja-JP"],
    ["Open 9am-6pm", "Ouvert 9-18 h", "fr-FR"],
    ["Open 9am-6pm", "Ouvert de 9 h \u00e0 18 h", "fr-FR"],
    ["Delivery between 6 and 8 PM", "Livraison entre 18 h et 20 h", "fr-FR"],
    ["Delivery between 6 and 8 PM", "Livraison entre 18 et 20 h", "fr-FR"],
    ["Delivery between 6 and 8 PM", "Lieferung zwischen 18 und 20 Uhr", "de-DE"],
    ["Live 9:30-11pm", "Live 9.30-11pm", "en-GB"],
  ])("an_opening_hours_range_matches_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it("a_changed_closing_hour_is_a_finding", () => {
    expect(numberRows("Open 9am-5pm", "Ge\u00f6ffnet 9-18 Uhr")).toEqual([["17:00", "18:00"]]);
  });
});

describe("the half of the day of a range", () => {
  it.each([
    ["Open 6-9pm", ["18:00", "21:00"]],
    ["Open 11-2pm", ["11:00", "14:00"]],
    ["Open 12-6pm", ["12:00", "18:00"]],
    ["Open 10-12pm", ["10:00", "12:00"]],
  ])("a_bare_first_hour_takes_the_half_that_keeps_it_first_%#", (text, expected) => {
    expect(timesIn("en-US", text)).toEqual(expected);
  });

  it.each([
    ["Lunch 12-2pm", "Mittagessen 12-14 Uhr", "de-DE"],
    ["Open 1-5pm", "\u5348\u5f8c1\u6642\uff5e5\u6642", "ja-JP"],
    ["Open 1-5pm", "\u5348\u5f8c1\uff5e5\u6642", "ja-JP"],
    ["Live 1:30-3pm", "\u5348\u5f8c1\u664230\u5206\uff5e3\u6642", "ja-JP"],
  ])("a_half_written_once_covers_the_whole_range_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it("a_changed_end_after_a_japanese_half_is_a_finding", () => {
    expect(numberRows("Open 1-5pm", "\u5348\u5f8c1\u6642\uff5e6\u6642", "ja-JP")).toEqual([
      ["17:00", "18:00"],
    ]);
  });

  it("a_changed_end_of_a_noon_range_is_a_finding", () => {
    expect(numberRows("Lunch 12-2pm", "Mittagessen 12-15 Uhr")).toEqual([["14:00", "15:00"]]);
  });
});
