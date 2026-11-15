import { describe, expect, it } from "vitest";
import { tokensOf } from "../../support/builders";
import { dateRows } from "../../support/rows";

const NONE = [[], [], []];

describe("Japanese ranges with weekdays and times", () => {
  it("a_slash_range_takes_a_weekday_after_each_day", () => {
    expect(
      dateRows("Valid Fri, Nov 27 - Mon, Nov 30", "11/27(\u91d1)\uff5e30(\u6708)", "ja-JP"),
    ).toEqual(NONE);
  });

  it("a_time_after_the_first_day_stays_a_time", () => {
    const ja = "11\u670827\u65e5(\u91d1)0\u6642\uff5e30\u65e5(\u6708)23\u664259\u5206";
    expect(dateRows("Nov 27, 12:00 AM - Nov 30, 11:59 PM", ja, "ja-JP")).toEqual(NONE);
  });

  it("a_first_date_keeps_its_weekday_when_the_range_fails", () => {
    const found = tokensOf("ja-JP", "11\u670827\u65e5(\u91d1)\uff5e3\u65e5(\u6728)");
    expect([found.dates, found.weekdays]).toEqual([
      [{ month: 11, day: 27, year: null, weekday: 4 }],
      [3],
    ]);
  });
});

describe("a slash date after punctuation", () => {
  it.each([
    ["Valid 11/27,11/29", "G\u00fcltig 27.11., 29.11."],
    ["Sale.11/29 only", "Sale. Nur 29.11."],
  ])("a_slash_date_after_a_comma_or_full_stop_is_a_date_%#", (master, target) => {
    expect(dateRows(master, target)).toEqual(NONE);
  });

  it("a_changed_slash_date_after_a_comma_is_a_dates_finding", () => {
    expect(dateRows("Valid 11/27,11/29", "G\u00fcltig 27.11., 30.11.")).toEqual([
      [["11/29", "11/30"]],
      [],
      [],
    ]);
  });
});

describe("every range form has a changed-day partner", () => {
  it.each([
    [
      "Nov 27-30",
      "11\u670827\u65e5\uff08\u91d1\uff09\uff5e29\u65e5\uff08\u65e5\uff09",
      "ja-JP",
      [["11/30", "11/29"]],
    ],
    ["Valid Nov 27-30", "11/27\uff5e29\u6709\u52b9", "ja-JP", [["11/30", "11/29"]]],
    [
      "For 30 days from Nov 27",
      "11\u670828\u65e5\u304b\u308930\u65e5\u9593\u9650\u5b9a",
      "ja-JP",
      [["11/27", "11/28"]],
    ],
    ["Valid May 1-3", "Valable du 1er au 4 mai", "fr-FR", [["5/3", "5/4"]]],
    [
      "Offer valid Nov 27th-30th",
      "G\u00fcltig vom 27. bis 29. November",
      "de-DE",
      [["11/30", "11/29"]],
    ],
    [
      "Sat, Nov 28 - Sun, Nov 29",
      "Sa., 28. - So., 30. November",
      "de-DE",
      [["11/29 Sun", "11/30 Sun"]],
    ],
    ["Sat-Sun, Nov 28-29", "Sa.-So., 28.-30. November", "de-DE", [["11/29 Sun", "11/30 Sun"]]],
  ])("a_changed_day_in_a_range_is_a_dates_finding_%#", (master, target, locale, expected) => {
    expect(dateRows(master, target, locale)[0]).toEqual(expected);
  });
});
