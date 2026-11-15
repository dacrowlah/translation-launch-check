import { describe, expect, it } from "vitest";
import { checkDates } from "../../../src/domain/checks/dates";
import { checkNumbers } from "../../../src/domain/checks/numbers";
import { extractDates } from "../../../src/domain/tokens/dates";
import { aDate, aPair, ctx, inLocale } from "../../support/builders";
import { rows } from "../../support/rows";

const OFFER = "Offer valid Nov 27-30";
const day = (d: number) => aDate({ month: 11, day: d });
const datesIn = inLocale(extractDates);
const compared = (master: string, target: string, locale = "de-DE") => {
  const [pair, c] = [aPair(master, target, locale), ctx(locale)];
  return [rows(checkDates(pair, c).dates), rows(checkNumbers(pair, c))];
};

describe("date ranges", () => {
  it.each([
    ["en-US", "Nov 27-30"],
    ["en-US", "Nov 27 to 30"],
    ["en-GB", "27-30 November"],
    ["de-DE", "vom 27. bis 30. November"],
    ["de-DE", "27.-30.11."],
    ["fr-FR", "du 27 au 30 novembre"],
    ["ja-JP", "11\u670827\u65e5\u301c30\u65e5"],
  ])("reads_a_range_as_two_dates_of_one_month_%#", (locale, text) => {
    expect(datesIn(locale, text).dates).toEqual([day(27), day(30)]);
  });

  it.each([
    ["en-US", "Fri, Nov 27-30", [4, null]],
    ["ja-JP", "11\u670827\u65e5\u301c30\u65e5(\u6708)", [null, 0]],
  ])("gives_a_weekday_before_a_range_to_its_first_day_and_after_it_to_its_last_%#", (l, t, w) => {
    const found = datesIn(l, t).dates;
    expect(found.map((d) => d.weekday)).toEqual(w);
  });

  it("a_percentage_after_a_month_and_day_is_no_range", () => {
    const found = datesIn("en-US", "Nov 27 - 30% off");
    expect([found.dates, found.rest]).toEqual([[day(27)], "  - 30% off"]);
  });

  it.each([
    ["G\u00fcltig vom 27. bis 30. November", "de-DE"],
    ["G\u00fcltig 27.-30. November", "de-DE"],
    ["Valable du 27 au 30 novembre", "fr-FR"],
    ["11\u670827\u65e5\uff5e30\u65e5\u6709\u52b9", "ja-JP"],
  ])("the_same_range_written_locally_matches_%#", (target, locale) => {
    expect(compared(OFFER, target, locale)).toEqual([[], []]);
  });

  it("two_full_dates_match_a_range", () => {
    expect(compared("Offer valid Nov 27 - Nov 30", "vom 27. bis 30. November")).toEqual([[], []]);
  });

  it("a_changed_last_day_is_one_dates_row", () => {
    expect(compared("Nov 27-30", "27.-29. November")).toEqual([[["11/30", "11/29"]], []]);
  });

  it("a_range_of_percentages_is_no_date", () => {
    const pair = aPair("Save 20-30%", "Sparen Sie 20-30%");
    expect([pair.master.dates, pair.target.dates, rows(checkNumbers(pair, ctx()))]).toEqual([
      [],
      [],
      [],
    ]);
  });

  it("a_changed_percentage_range_is_a_numbers_finding", () => {
    expect(compared("Save 20-30%", "Sparen Sie 20-40%")[1]).toEqual([["30%", "40%"]]);
  });
});
