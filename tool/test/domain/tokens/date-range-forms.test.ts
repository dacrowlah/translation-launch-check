import { describe, expect, it } from "vitest";
import { tokensOf } from "../../support/builders";
import { dateRows } from "../../support/rows";

const NONE = [[], [], []];

describe("a range end is a day, never the hour of a time", () => {
  it.each([
    ["Sale ends Nov 27 - 11:59 PM PT", "Endet am 27. Nov. - 23:59 Uhr PT", "de-DE"],
    ["Nov 27 to 11 PM", "27. Nov. bis 23 Uhr", "de-DE"],
    ["Live: Nov 27 - 7:00 PM ET", "Live: 27. November \u2013 19:00 Uhr ET", "de-DE"],
    ["Live: Dec 3 - 8 PM ET", "12\u67083\u65e5\u5348\u5f8c8\u6642\uff08ET\uff09", "ja-JP"],
  ])("a_date_followed_by_a_time_is_one_date_and_a_time_%#", (master, target, locale) => {
    expect(dateRows(master, target, locale)).toEqual(NONE);
  });

  it("a_changed_time_after_a_date_is_a_numbers_finding", () => {
    const found = dateRows("Live: Dec 3 - 8 PM ET", "12\u67083\u65e5\u5348\u5f8c9\u6642", "ja-JP");
    expect(found).toEqual([[], [["20:00", "21:00"]], []]);
  });

  it("a_last_day_before_the_first_is_no_range", () => {
    const found = tokensOf("en-US", "Ships Nov 27 - 7 days");
    expect([found.dates.map((d) => d.day), found.numbers]).toEqual([[27], ["7"]]);
  });
});

describe("Japanese ranges", () => {
  it.each([
    ["Nov 27-30", "11\u670827\u65e5\uff08\u91d1\uff09\uff5e30\u65e5\uff08\u6708\uff09"],
    ["For 30 days from Nov 27", "11\u670827\u65e5\u304b\u308930\u65e5\u9593\u9650\u5b9a"],
    ["7 days only from Nov 27", "11\u670827\u65e5\u304b\u30897\u65e5\u9593\u9650\u5b9a"],
    ["Valid Nov 27-30", "11/27\uff5e30\u6709\u52b9"],
  ])("weekdays_and_durations_read_right_%#", (master, target) => {
    expect(dateRows(master, target, "ja-JP")).toEqual(NONE);
  });
});

describe("more range forms", () => {
  it.each([
    ["Valid May 1-3", "Valable du 1er au 3 mai", "fr-FR"],
    ["Offer valid Nov 27th-30th", "G\u00fcltig vom 27. bis 30. November", "de-DE"],
    ["Valid 11/27-30", "G\u00fcltig vom 27. bis 30. November", "de-DE"],
    ["Nov 27-30", "du 27 au 30/11", "fr-FR"],
    ["Sat, Nov 28 - Sun, Nov 29", "Sa., 28. - So., 29. November", "de-DE"],
    ["Sat-Sun, Nov 28-29", "Sa.-So., 28.-29. November", "de-DE"],
  ])("the_same_range_in_another_form_matches_%#", (master, target, locale) => {
    expect(dateRows(master, target, locale)).toEqual(NONE);
  });

  it("a_weekday_range_gives_its_last_weekday_to_the_last_day", () => {
    const found = tokensOf("de-DE", "Sa.-So., 28.-29. November");
    expect(found.dates.map((d) => d.weekday)).toEqual([5, 6]);
  });

  it("a_changed_last_day_in_a_slash_range_is_a_finding", () => {
    expect(dateRows("Valid 11/27-30", "G\u00fcltig vom 27. bis 29. November")).toEqual([
      [["11/30", "11/29"]],
      [],
      [],
    ]);
  });
});
