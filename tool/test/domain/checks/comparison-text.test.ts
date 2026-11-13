import { describe, expect, it } from "vitest";
import { checkDates } from "../../../src/domain/checks/dates";
import { checkMarkup } from "../../../src/domain/checks/markup";
import { checkMergeTags } from "../../../src/domain/checks/merge-tags";
import { checkTrademarks } from "../../../src/domain/checks/trademarks";
import { checkUrls } from "../../../src/domain/checks/urls";
import { aPair, ctx } from "../../support/builders";

describe("dates", () => {
  it("flags_a_changed_date_and_weekday", () => {
    const r = checkDates(aPair("Ends Sunday, Nov 29", "Endet Montag, 30. November"), ctx());
    expect(r.dates?.findings).toHaveLength(1);
    expect(r.weekday_date_match?.findings).toEqual([]); // 2026-11-30 is a Monday
  });
  it("flags_a_weekday_that_does_not_match_its_date", () => {
    const pair = aPair("Sunday, Nov 29", "Samstag, 29. November");
    expect(checkDates(pair, ctx()).weekday_date_match?.findings).toHaveLength(1);
  });
  it("skips_the_weekday_check_for_an_impossible_date", () => {
    const r = checkDates(aPair("Monday, Feb 30", "Montag, 30. Februar"), ctx());
    expect(r.weekday_date_match?.findings).toEqual([]);
    expect(r.dates?.findings).toEqual([]);
  });
  it("slash_dates_without_a_year_are_numbers_not_dates", () => {
    expect(checkDates(aPair("Ends 11/29", "Endet 29/11"), ctx("fr-FR")).dates?.findings).toEqual(
      [],
    );
  });
  it("reordered_tokens_are_not_findings", () => {
    const p = aPair(
      "{{a}} then {{b}}: https://e.com/x on Nov 29 and https://e.com/y on Nov 30",
      "https://e.com/y am 30. November, {{b}} und {{a}}, https://e.com/x am 29. November",
    );
    expect(
      [
        checkMergeTags(p, ctx()),
        checkUrls(p, ctx()).url_params,
        checkDates(p, ctx()).dates,
      ].flatMap((r) => r?.findings ?? []),
    ).toEqual([]);
  });
  it("ignores_do_not_translate_weekdays", () => {
    const r = checkDates(aPair("Black Friday Sale", "Black Friday Sale"), ctx());
    expect(r.dates?.findings).toEqual([]);
  });
  it("flags_a_changed_bare_weekday", () => {
    const pair = aPair("Black Friday deals end Sunday", "Black-Friday-Angebote enden Montag");
    expect(checkDates(pair, ctx()).dates?.findings).toHaveLength(1);
  });
});

describe("trademarks and markup", () => {
  it("dropped_registered_sign_is_a_warning", () => {
    expect(
      checkTrademarks(aPair("TrailPro\u00ae jackets", "TrailPro Jacken"), ctx()).findings[0],
    ).toMatchObject({
      check: "trademark_symbols",
      severity: "warning",
      expected: "\u00ae",
      found: null,
    });
  });
  it("normalizes_ascii_trademark_forms", () => {
    expect(checkTrademarks(aPair("TrailPro (TM)", "TrailPro\u2122"), ctx()).findings).toEqual([]);
  });
  it("flags_an_added_trademark_sign", () => {
    const r = checkTrademarks(aPair("TrailPro", "TrailPro\u00a9"), ctx());
    expect(r.findings[0]).toMatchObject({ expected: null, found: "\u00a9" });
  });
  it("unclosed_tag_is_a_blocker", () => {
    expect(checkMarkup(aPair("<b>30% off</b>", "<b>30 % Rabatt"), ctx()).findings[0]).toMatchObject(
      { check: "markup", severity: "blocker", expected: "</b>" },
    );
    expect(checkMarkup(aPair("Line<br>two", "Zeile<br>zwei"), ctx()).findings).toEqual([]);
  });
  it("flags_tags_that_are_misnested_in_the_translation", () => {
    const r = checkMarkup(aPair("<b><i>x</i></b>", "<b><i>x</b></i>"), ctx());
    expect(r.findings).toHaveLength(1);
  });
  it("flags_an_extra_tag_in_the_translation", () => {
    const r = checkMarkup(aPair("Hi", "Hallo <u>du</u>"), ctx());
    expect(r.findings[0]).toMatchObject({ expected: null, found: "<u>" });
  });
});
