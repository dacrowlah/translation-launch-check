import { describe, expect, it } from "vitest";
import { checkDates } from "../../../src/domain/checks/dates";
import { checkCurrency } from "../../../src/domain/checks/money";
import { checkTrademarks } from "../../../src/domain/checks/trademarks";
import { checkUrls } from "../../../src/domain/checks/urls";
import { aPair, ctx } from "../../support/builders";

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
    expect(r.dates?.findings).toHaveLength(1);
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
    expect(r.url_path?.findings).toHaveLength(2);
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
    expect(r.currency_code?.findings).toHaveLength(1);
    const amounts = r.currency_amount?.findings ?? [];
    expect(amounts.map((f) => f.found)).toContain("150.00 USD");
  });
  it("one_currency_warning_per_line_when_no_currency_is_shared", () => {
    const r = checkCurrency(aPair("$20 and $100", "20 \u20ac und 100 \u20ac"), ctx());
    expect(r.currency_code?.findings).toHaveLength(1);
    expect(r.currency_amount?.findings).toEqual([]);
  });
  it("lists_amount_before_code_in_check_table_order", () => {
    const r = checkCurrency(aPair("$20", "$20"), ctx());
    expect(Object.keys(r)).toEqual(["currency_amount", "currency_code"]);
  });
});
