import { describe, expect, it } from "vitest";
import { timesIn } from "../../support/builders.js";
import { numberRows } from "../../support/rows.js";

describe("an hour-only time or a time word is a time only if the other side has one", () => {
  it.each([
    ["Midnight Sale ends Nov 29", "Midnight Sale endet am 29. November", "de-DE"],
    ["Midnight Blue jacket", "Jacke in Mitternachtsblau", "de-DE"],
    [
      "Choose from Midnight Blue or Ivory",
      "W\u00e4hlen Sie Mitternachtsblau oder Elfenbein",
      "de-DE",
    ],
    ["Holidays in the South", "Vacances dans le Midi", "fr-FR"],
    ["24-hour delivery", "Livraison en 24 h", "fr-FR"],
    ["2 hours from Paris", "H\u00f4tel \u00e0 2 h de Paris", "fr-FR"],
    ["Delivery in 1-2 hours", "Livraison en 1 \u00e0 2 h", "fr-FR"],
    ["12-24 hour delivery", "Livraison en 12 \u00e0 24 h", "fr-FR"],
    ["Last 24 hours!", "\u00c0 24 h de la fin !", "fr-FR"],
    ["Ends at noon", "Endet mittags", "de-DE"],
  ])("a_candidate_without_a_time_opposite_is_words_or_numbers_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it.each([
    ["Shop till midnight", "Shoppen Sie bis Mitternacht", "de-DE"],
    ["Valid through midnight", "G\u00fcltig bis Mitternacht", "de-DE"],
    ["Ends at noon", "\u6b63\u5348\u306b\u7d42\u4e86", "ja-JP"],
    ["Ends at 12:00", "Ends at midday", "en-GB"],
    ["Ends at midnight ET", "Endet um 24 Uhr MEZ", "de-DE"],
    ["Starts at 8 PM", "\u00c0 partir de 20 h", "fr-FR"],
    ["Delivered by 6 PM", "Livr\u00e9 vers 18 h", "fr-FR"],
    ["Sunday, Nov 29, 8 PM", "Dimanche 29 novembre, 20 h", "fr-FR"],
    ["Open noon-6pm", "Ge\u00f6ffnet 12-18 Uhr", "de-DE"],
  ])("candidates_opposite_a_time_are_times_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it.each([
    ["Ends at 9 pm", "Endet um 20 Uhr", "de-DE", [["21:00", "20:00"]]],
    ["Ends at 9 PM", "Fin \u00e0 22 h", "fr-FR", [["21:00", "22:00"]]],
  ])("a_changed_candidate_time_is_a_finding_%#", (master, target, locale, expected) => {
    expect(numberRows(master, target, locale)).toEqual(expected);
  });

  it("a_deadline_before_a_duration_pairs_by_value", () => {
    const found = numberRows(
      "Ends 9 PM, 24-hour delivery",
      "Fin \u00e0 21 h, livraison en 24 h",
      "fr-FR",
    );
    expect(found).toEqual([]);
  });

  it("twelve_noon_is_one_candidate", () => {
    expect(timesIn("en-US", "Ends at 12 noon")).toEqual(["12:00"]);
  });

  it("twelve_noon_opposite_a_definite_noon_leaves_no_stray_number", () => {
    expect(numberRows("Ends at 12 noon", "Endet um 12:00 Uhr")).toEqual([]);
  });

  it("a_time_word_before_a_hyphen_and_a_letter_is_a_name", () => {
    expect(timesIn("fr-FR", "Vacances en Midi-Pyr\u00e9n\u00e9es")).toEqual([]);
  });

  it("a_region_named_after_a_time_word_never_takes_a_changed_times_slot", () => {
    const target = "Visites en Midi-Pyr\u00e9n\u00e9es \u00e0 11 h";
    expect(numberRows("Tours at 10 AM", target, "fr-FR")).toEqual([["10:00", "11:00"]]);
  });
});

describe("clock forms", () => {
  it.each([
    ["Ends 9:30 PM", "Ends 9.30pm", "en-GB"],
    ["Ends at midnight", "\u5348\u524d0\u6642\u306b\u7d42\u4e86", "ja-JP"],
    ["Starts at noon", "\u5348\u5f8c0\u6642\u958b\u59cb", "ja-JP"],
    ["Starts at 9:30", "9\u6642\u534a\u958b\u59cb", "ja-JP"],
    ["Ends 9 PM", "\u5348\u5f8c 9\u6642\u306b\u7d42\u4e86", "ja-JP"],
  ])("the_same_time_in_another_clock_form_matches_%#", (master, target, locale) => {
    expect(numberRows(master, target, locale)).toEqual([]);
  });

  it.each([
    ["en-US", "12am", ["00:00"]],
    ["en-US", "12pm", ["12:00"]],
  ])("reads_twelve_am_and_pm_%#", (locale, text, expected) => {
    expect(timesIn(locale, text)).toEqual(expected);
  });

  it("a_price_is_no_dotted_time", () => {
    expect(timesIn("en-GB", "only 9.30 left")).toEqual([]);
  });

  it("known_limitation_a_ratio_written_with_a_colon_is_a_time", () => {
    expect(numberRows("16:10 display", "\u00e9cran 16/10", "fr-FR")).toEqual([
      ["16:10", "16"],
      [null, "10"],
    ]);
  });
});
