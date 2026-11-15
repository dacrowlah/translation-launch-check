import { describe, expect, it } from "vitest";
import { checkDates } from "../../../src/domain/checks/dates";
import { checkCurrency } from "../../../src/domain/checks/money";
import { checkTrademarks } from "../../../src/domain/checks/trademarks";
import { checkUrls } from "../../../src/domain/checks/urls";
import { aPair, ctx } from "../../support/builders";
import { rows } from "../../support/rows";

describe("dates semantics", () => {
  it("a_date_without_a_weekday_is_not_a_weekday_mismatch", () => {
    const r = checkDates(aPair("Ends Nov 29", "Endet am 29. November"), ctx());
    expect([r.weekday_date_match?.findings, r.dates?.findings]).toEqual([[], []]);
  });
  it("a_weekday_only_in_the_translation_is_judged_by_the_weekday_match", () => {
    const r = checkDates(aPair("Ends Nov 29", "Endet Sonntag, 29. November"), ctx());
    expect([r.dates?.findings, r.weekday_date_match?.findings]).toEqual([[], []]);
  });
  it("japanese_weekday_and_date_match_the_master", () => {
    const ja = "\u65e5\u66dc\u65e5\u3001" + "11\u670829\u65e5\u307e\u3067";
    const r = checkDates(aPair("Ends Sunday, Nov 29", ja, "ja-JP"), ctx("ja-JP"));
    expect(r.dates?.findings).toEqual([]);
  });
  it("a_different_weekday_with_the_same_date_is_a_dates_finding", () => {
    const r = checkDates(aPair("Ends Sunday, Nov 29", "Endet Montag, 29. November"), ctx());
    expect(rows(r.dates)).toEqual([["11/29 Sun", "11/29 Mon"]]);
  });
  it("a_changed_date_against_a_master_weekday_shows_both_weekdays", () => {
    const r = checkDates(aPair("Ends Sunday, Nov 29", "Endet Montag, 30. November"), ctx());
    expect([rows(r.dates), rows(r.weekday_date_match)]).toEqual([[["11/29 Sun", "11/30 Mon"]], []]);
  });
  it("a_changed_date_without_a_master_weekday_shows_month_and_day_only", () => {
    const r = checkDates(aPair("Ends Nov 29", "Endet Montag, 30. November"), ctx());
    expect([rows(r.dates), rows(r.weekday_date_match)]).toEqual([[["11/29", "11/30"]], []]);
  });
  it("a_weekday_in_a_do_not_translate_term_is_no_weekday", () => {
    const r = checkDates(aPair("Cyber Monday", "Cyber Monday"), ctx());
    expect(r.dates).toEqual({ applicable: false, findings: [] });
  });
  it("a_weekday_name_alone_still_counts_next_to_the_term", () => {
    const r = checkDates(aPair("Cyber Monday ends Monday", "Cyber Monday endet Dienstag"), ctx());
    expect(rows(r.dates)).toEqual([["Mon", "Tue"]]);
  });
  it("a_do_not_translate_term_inside_a_link_stays_part_of_the_link", () => {
    const link = "https://x.com/black-friday?utm_source=email";
    const pair = aPair(`Black Friday deals ${link}`, `Black Friday Angebote ${link}`);
    const [urls, dates] = [checkUrls(pair, ctx()), checkDates(pair, ctx())];
    expect([rows(urls.url_params), rows(urls.url_path), dates.dates?.findings]).toEqual([
      [],
      [],
      [],
    ]);
  });
  it("a_hyphenated_do_not_translate_term_is_stripped", () => {
    const r = checkDates(
      aPair("Black Friday deals end Sunday", "Black-Friday deals end Sunday", "en-GB"),
      ctx("en-GB"),
    );
    expect(r.dates?.findings).toEqual([]);
  });
});

describe("urls and trademarks", () => {
  it("pairs_localized_links_in_order_of_appearance", () => {
    const master = "https://e.com/en/terms?c=t https://e.com/en/sale?c=s";
    const r = checkUrls(
      aPair(master, "https://e.com/de/agb?c=t https://e.com/de/angebote?c=s"),
      ctx(),
    );
    expect(r.url_params?.findings).toEqual([]);
    expect(rows(r.url_path)).toEqual([
      ["/en/terms", "/de/agb"],
      ["/en/sale", "/de/angebote"],
    ]);
  });
  it("pairs_a_repeated_landing_page_by_its_query", () => {
    const hero = "https://e.com/bf?utm_content=hero";
    const foot = "https://e.com/bf?utm_content=footer";
    const r = checkUrls(aPair(`A ${hero} B ${foot}`, `B ${foot} A ${hero}`), ctx());
    expect(r.url_params?.findings).toEqual([]);
  });
  it("an_extra_query_parameter_is_a_finding", () => {
    const r = checkUrls(
      aPair("https://e.com/x?utm_source=email", "https://e.com/x?utm_source=email&ref=x"),
      ctx(),
    );
    expect(r.url_params?.findings[0]).toMatchObject({ expected: null, found: "ref=x" });
  });
  it("lowercase_parenthesised_letters_are_not_trademark_symbols", () => {
    const r = checkTrademarks(aPair("(a) x (c) y", "a) x c) y"), ctx());
    expect(r.findings).toEqual([]);
  });
});

describe("currency per code", () => {
  it("compares_amounts_of_a_shared_currency_and_flags_the_new_one", () => {
    const r = checkCurrency(aPair("$20 and $100", "20 \u20ac und $150"), ctx());
    expect(rows(r.currency_code)).toEqual([[null, "EUR"]]);
    expect(rows(r.currency_amount)).toEqual([
      ["20.00 USD", "150.00 USD"],
      ["100.00 USD", null],
    ]);
  });
  it("one_currency_warning_per_line_when_no_currency_is_shared", () => {
    const r = checkCurrency(aPair("$20 and $100", "20 \u20ac und 100 \u20ac"), ctx());
    expect([rows(r.currency_code), rows(r.currency_amount)]).toEqual([[["USD", "EUR"]], []]);
  });
  it("lists_amount_before_code_in_check_table_order", () => {
    const r = checkCurrency(aPair("$20", "$20"), ctx());
    expect(Object.keys(r)).toEqual(["currency_amount", "currency_code"]);
  });
});
