import { describe, expect, it } from "vitest";
import { tokensOf } from "../../support/builders";
import { resolvePair } from "../../../src/domain/tokens/resolve-pair";
import { dateRows } from "../../support/rows";

const NONE = [[], [], []];

describe("yearless slash forms wait for the other side", () => {
  it("keeps_a_yearless_slash_form_unresolved", () => {
    const found = tokensOf("en-US", "Sale ends Sunday 11/29 and 24/7");
    expect([found.dates, found.numbers, found.slashes]).toEqual([
      [],
      [],
      [
        { numbers: ["11", "29"], date: { month: 11, day: 29, year: null, weekday: 6 }, weekday: 6 },
        { numbers: ["24", "7"], date: null, weekday: null },
      ],
    ]);
  });

  it("reads_a_year_first_slash_date_in_every_locale", () => {
    const date = { month: 11, day: 29, year: 2026, weekday: null };
    expect(["en-GB", "de-DE", "ja-JP"].map((l) => tokensOf(l, "2026/11/29").dates)).toEqual([
      [date],
      [date],
      [date],
    ]);
  });

  it("leaves_no_slash_form_after_resolving", () => {
    const [master, target] = resolvePair(tokensOf("en-US", "11/29"), tokensOf("de-DE", "29.11."));
    expect([master.slashes, target.slashes, master.dates.length]).toEqual([[], [], 1]);
  });
});

describe("slash dates in a pair", () => {
  it.each([
    ["Early access ends 11/29.", "Fr\u00fcher Zugang endet am 29.11.", "de-DE"],
    ["Ends Sunday 11/29", "Endet Sonntag, 29.11.", "de-DE"],
    ["Ends Sunday, Nov 29.", "11/29(\u65e5)\u307e\u3067\u3002", "ja-JP"],
    ["Ends 11/29/2026.", "2026/11/29\u307e\u3067\u3002", "ja-JP"],
    ["Ends 11/29", "Ends 29/11", "en-GB"],
    ["3/4 sleeves", "3/4-\u00c4rmel", "de-DE"],
    ["24/7 support", "24/7 Support", "de-DE"],
    ["1/2 price", "1/2 Preis", "de-DE"],
  ])("a_date_written_the_local_way_matches_%#", (master, target, locale) => {
    expect(dateRows(master, target, locale)).toEqual(NONE);
  });

  it("a_slash_date_changed_to_another_date_is_one_dates_row", () => {
    expect(dateRows("Ends 11/29.", "Endet am 30.11.")).toEqual([[["11/29", "11/30"]], [], []]);
  });

  it("a_changed_weekday_and_date_against_a_slash_date_is_a_dates_row", () => {
    const found = dateRows("Ends Sunday, Nov 29.", "11/30(\u6708)\u307e\u3067", "ja-JP");
    expect(found[0]).toEqual([["11/29 Sun", "11/30 Mon"]]);
  });

  it("a_changed_fraction_is_a_numbers_finding", () => {
    expect(dateRows("3/4 sleeves", "2/3-\u00c4rmel")[1]).toEqual([["4", "2"]]);
  });

  it("a_weekday_before_a_slash_read_as_numbers_still_counts", () => {
    expect(dateRows("Open Sunday 24/7", "Samstag 24/7 offen")[0]).toEqual([["Sun", "Sat"]]);
  });

  it("a_changed_slash_date_against_a_slash_date_reads_as_changed_numbers", () => {
    expect(dateRows("Ends 11/29", "Ends 30/11", "en-GB")).toEqual([[], [["29", "30"]], []]);
  });

  it("known_limitation_an_unchanged_us_date_in_en_gb_reads_as_matching_numbers", () => {
    expect(dateRows("Ends 12/1", "Ends 12/1", "en-GB")).toEqual(NONE);
  });
});

describe("rule (b) is one to one and twins resolve together", () => {
  it.each([
    ["3/4 sleeves until 11/29", "3/4-\u00c4rmel bis 30.11."],
    ["Get 1/2 off. Ends Nov 29", "1/2 Rabatt. Endet 30. Nov."],
    ["Sizes 10/12 - ends Nov 29", "Gr\u00f6\u00dfen 10/12 - endet am 30. November"],
  ])("a_fraction_beside_a_changed_date_stays_numbers_%#", (master, target) => {
    expect(dateRows(master, target)).toEqual([[["11/29", "11/30"]], [], []]);
  });

  it("a_shared_fraction_never_becomes_a_date_on_one_side", () => {
    expect(dateRows("3/4 sleeves, Nov 27 and Nov 29", "3/4-\u00c4rmel, 29. November")).toEqual([
      [["11/27", null]],
      [],
      [],
    ]);
  });

  it("only_as_many_slash_forms_become_dates_as_the_other_side_has_new_dates", () => {
    expect(dateRows("Ends 11/29 or 12/3", "Endet 30.11.")).toEqual([
      [["11/29", "11/30"]],
      [
        ["12", null],
        ["3", null],
      ],
      [],
    ]);
  });
});

describe("slash dates on the 5th and 10th", () => {
  it.each([
    ["Ends 11/5", "Endet am 5.11."],
    ["Ends 10/10", "Endet am 10.10."],
  ])("a_slash_date_on_the_5th_or_10th_is_a_date_%#", (master, target) => {
    expect(dateRows(master, target)).toEqual([[], [], []]);
  });

  it("a_changed_slash_date_on_the_5th_is_a_dates_finding", () => {
    expect(dateRows("Ends 11/5", "Endet am 6.11.")).toEqual([[["11/5", "11/6"]], [], []]);
  });
});
