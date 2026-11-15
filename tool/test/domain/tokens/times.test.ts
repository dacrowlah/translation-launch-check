import { describe, expect, it } from "vitest";
import { extractTimes } from "../../../src/domain/tokens/times";
import { aPair, inLocale, timesIn, tokensOf } from "../../support/builders";
import { numberRows } from "../../support/rows";
import { testLocale, testRules } from "../../support/rules";

describe("extractTimes", () => {
  it.each([
    ["en-US", "at 11:59 PM PT", ["23:59"]],
    ["en-US", "at 9 a.m.", ["09:00"]],
    ["en-US", "12 AM and 12 PM", ["00:00", "12:00"]],
    ["en-US", "by 18:30", ["18:30"]],
    ["en-US", "at midnight or by Noon", ["00:00", "12:00"]],
    ["de-DE", "um 23:59 Uhr", ["23:59"]],
    ["de-DE", "um 20.00 Uhr", ["20:00"]],
    ["de-DE", "um 24 Uhr", ["00:00"]],
    ["de-DE", "bis Mitternacht", ["00:00"]],
    ["fr-FR", "\u00e0 21 h", ["21:00"]],
    ["fr-FR", "\u00e0 21h30", ["21:30"]],
    ["fr-FR", "\u00e0 minuit", ["00:00"]],
    ["ja-JP", "\u5348\u5f8c9\u6642", ["21:00"]],
    ["ja-JP", "9\u664230\u5206", ["09:30"]],
    ["ja-JP", "\u6b63\u5348\u307e\u3067", ["12:00"]],
  ])("normalizes_clock_times_%#", (locale, text, expected) => {
    expect(timesIn(locale, text)).toEqual(expected);
  });

  it.each([
    ["en-US", "16:9 display"],
    ["en-US", "Save 9 percent"],
    ["ja-JP", "24\u6642\u9593\u9650\u5b9a"],
    ["en-US", "at 25:00"],
    ["en-US", "at 13 PM"],
    ["fr-FR", "cet apr\u00e8s-midi"],
    ["fr-FR", "5 heures"],
  ])("leaves_what_is_no_clock_time_%#", (locale, text) => {
    expect(timesIn(locale, text)).toEqual([]);
  });

  it("takes_times_before_numbers", () => {
    const found = tokensOf("en-US", "Ends at 9:30 PM, 20% off");
    expect([found.times, found.numbers]).toEqual([["21:30"], ["20%"]]);
  });

  it.each([
    ["en-US", "at 9:30 PM", ["21:30"], []],
    ["de-DE", "um 23:59 Uhr", ["23:59"], []],
    ["de-DE", "um 23 Uhr", [], ["23:00"]],
    ["fr-FR", "\u00e0 21 h", [], ["21:00"]],
    ["ja-JP", "9\u6642", [], ["09:00"]],
    ["ja-JP", "\u5348\u5f8c9\u6642", ["21:00"], []],
    ["en-US", "at midnight", [], ["00:00"]],
  ])("tells_a_definite_time_from_a_candidate_%#", (locale, text, definite, candidates) => {
    const found = inLocale(extractTimes)(locale, text);
    expect([found.times, found.candidates.map((c) => c.time)]).toEqual([definite, candidates]);
  });
});

describe("clock times in a pair", () => {
  it.each([
    ["Offer ends at 11:59 PM PT", "Angebot endet um 23:59 Uhr PT", "de-DE"],
    ["Ends tonight at 11 PM ET", "Endet heute um 23 Uhr ET", "de-DE"],
    ["Starts at 9:00 JST", "\uff19\u6642\u958b\u59cb JST", "ja-JP"],
    ["Sale ends at 9 PM ET.", "Fin \u00e0 21 h (heure de Paris).", "fr-FR"],
    ["Ends at midnight ET", "Endet um 24 Uhr MEZ", "de-DE"],
    ["Ends at midnight JST", "\u6df1\u591c0\u6642\u306b\u7d42\u4e86", "ja-JP"],
    ["24-hour flash sale", "24\u6642\u9593\u9650\u5b9a", "ja-JP"],
  ])("the_same_time_written_locally_matches_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it("a_changed_time_is_a_numbers_finding", () => {
    const found = numberRows("Sale ends at 9 PM ET.", "Endet um 22 Uhr MEZ.", "de-DE");
    expect(found).toEqual([["21:00", "22:00"]]);
  });

  it("reads_a_format_written_as_an_object_that_is_no_candidate_as_a_definite_time", () => {
    const definite = { pattern: "(?<h>\\d{1,2}) o'clock(?!\\p{L})", candidate: false };
    const formats = { ...testRules().time_formats, en: [definite] };
    const found = extractTimes("at 9 o'clock", testLocale("en-US"), {
      ...testRules(),
      time_formats: formats,
    });
    expect([found.times, found.candidates]).toEqual([["09:00"], []]);
  });

  it("a_ratio_is_two_numbers_on_both_sides", () => {
    const pair = aPair("16:9 display", "16:9-Display");
    expect([pair.master.numbers, pair.target.numbers, pair.target.times]).toEqual([
      ["16", "9"],
      ["16", "9"],
      [],
    ]);
  });
});
