import { describe, expect, it } from "vitest";
import { checkCurrency } from "../../../src/domain/checks/money.js";
import { checkMergeTags } from "../../../src/domain/checks/merge-tags.js";
import { checkNumbers } from "../../../src/domain/checks/numbers.js";
import { checkPromoCodes } from "../../../src/domain/checks/promo-codes.js";
import { checkUrls } from "../../../src/domain/checks/urls.js";
import { aPair, ctx } from "../../support/builders.js";
import { numberRows } from "../../support/rows.js";

const UNREAD_USD = {
  check: "currency_code",
  severity: "warning",
  confidence: "unsure",
  detail:
    "Couldn't find the master's price in this line. Is it written in a form the tool " +
    "can't read (in words, or glued to a word), or is it missing?",
  expected: "USD",
  found: null,
};

describe("numbers, merge tags, promo codes", () => {
  it("flags_a_changed_percentage", () => {
    const r = checkNumbers(aPair("30% off all jackets", "20 % auf alle Jacken"), ctx("de-DE"));
    expect(r.findings).toEqual([
      {
        check: "numbers",
        severity: "blocker",
        confidence: "certain",
        detail: "A number differs from the master.",
        expected: "30%",
        found: "20%",
      },
    ]);
  });
  it("accepts_a_spaced_percentage_and_localized_decimals", () => {
    const pair = aPair("20% off, 1,299.50 items", "20 % Rabatt, 1.299,50 Artikel");
    expect(checkNumbers(pair, ctx()).findings).toEqual([]);
  });
  it("flags_a_renamed_merge_tag", () => {
    expect(
      checkMergeTags(aPair("Hi {{first_name}},", "Hallo {{vorname}},"), ctx()).findings[0],
    ).toMatchObject({ check: "merge_tags", expected: "{{first_name}}", found: "{{vorname}}" });
  });
  it("flags_a_missing_merge_tag_as_expected_only", () => {
    const r = checkMergeTags(aPair("Hi {{first_name}}", "Hallo"), ctx());
    expect(r.findings[0]).toMatchObject({ expected: "{{first_name}}", found: null });
  });
  it("not_applicable_when_neither_side_has_tokens", () => {
    expect(checkPromoCodes(aPair("Shop now", "Jetzt kaufen"), ctx()).applicable).toBe(false);
  });
  it("an_extra_token_makes_the_check_applicable", () => {
    const r = checkPromoCodes(aPair("Shop now", "Code BF26 nutzen"), ctx());
    expect(r.applicable).toBe(true);
    expect(r.findings[0]).toMatchObject({ expected: null, found: "BF26" });
  });
  it("flags_a_changed_promo_code", () => {
    const r = checkPromoCodes(aPair("Use code BF26", "Code BF27 nutzen"), ctx());
    expect(r.findings[0]).toMatchObject({ check: "promo_codes", expected: "BF26", found: "BF27" });
  });
});

describe("urls", () => {
  it("flags_a_missing_utm_parameter", () => {
    const master = "https://e.com/bf?utm_source=email&utm_campaign=bf26";
    const r = checkUrls(aPair(master, "https://e.com/bf?utm_source=email", "fr-FR"), ctx("fr-FR"));
    expect(r.url_params?.findings[0]).toMatchObject({ expected: "utm_campaign=bf26", found: null });
  });
  it("flags_a_changed_host", () => {
    const r = checkUrls(aPair("https://e.com/x", "https://f.com/x"), ctx());
    expect(r.url_params?.findings[0]).toMatchObject({ expected: "e.com", found: "f.com" });
  });
  it("flags_a_dropped_link", () => {
    const r = checkUrls(aPair("See https://e.com/x", "Siehe oben"), ctx());
    expect(r.url_params?.findings[0]).toMatchObject({ expected: "https://e.com/x", found: null });
  });
  it("localized_path_is_info", () => {
    const r = checkUrls(aPair("https://e.com/en/terms", "https://e.com/de/agb"), ctx());
    expect(r.url_path?.findings[0]?.severity).toBe("info");
    expect(r.url_params?.findings).toEqual([]);
  });
  it("pairs_links_by_host_and_path_not_by_position", () => {
    const r = checkUrls(
      aPair("https://e.com/x?a=1 https://e.com/y?b=2", "https://e.com/y?b=2 https://e.com/x?a=1"),
      ctx(),
    );
    expect([r.url_params?.findings, r.url_path?.findings]).toEqual([[], []]);
  });
  it("not_applicable_without_links", () => {
    expect(checkUrls(aPair("Shop", "Kaufen"), ctx()).url_path?.applicable).toBe(false);
  });
});

describe("currency", () => {
  it("currency_change_is_a_warning_not_an_amount_blocker", () => {
    const r = checkCurrency(aPair("Free shipping over $50", "Gratisversand ab 50 \u20ac"), ctx());
    expect(r.currency_code?.findings[0]?.severity).toBe("warning");
    expect(r.currency_amount?.findings ?? []).toEqual([]);
  });
  it("flags_a_changed_amount_in_the_same_currency", () => {
    const r = checkCurrency(aPair("Only $50", "Nur 60 $"), ctx());
    expect(r.currency_amount?.findings[0]).toMatchObject({
      check: "currency_amount",
      expected: "50.00 USD",
      found: "60.00 USD",
    });
  });
  it("accepts_the_same_price_written_locally", () => {
    const r = checkCurrency(aPair("Only \u20ac1,299.50", "Nur 1.299,50 \u20ac"), ctx());
    expect([r.currency_amount?.findings, r.currency_code?.findings]).toEqual([[], []]);
  });
  it("a_currency_changed_to_another_is_a_certain_warning", () => {
    const r = checkCurrency(aPair("Only $50", "Nur 50 \u20ac"), ctx());
    expect(r.currency_code?.findings).toEqual([
      {
        check: "currency_code",
        severity: "warning",
        confidence: "certain",
        detail: "The currency differs from the master; confirm the local price.",
        expected: "USD",
        found: "EUR",
      },
    ]);
  });
  it("a_master_price_with_nothing_in_its_place_is_an_unsure_question", () => {
    const r = checkCurrency(aPair("Only $20", "Nur zwanzig Dollar"), ctx());
    expect(r.currency_code).toEqual({ applicable: true, findings: [UNREAD_USD] });
  });
  it("the_unsure_question_on_a_japanese_line_names_kanji_numerals", () => {
    const yen = "\u4e8c\u4e07\u5186\u5206\u306e\u30ae\u30d5\u30c8\u30ab\u30fc\u30c9";
    const r = checkCurrency(aPair("\u00a520,000 gift card", yen, "ja-JP"), ctx("ja-JP"));
    expect(r.currency_code?.findings[0]?.detail).toBe(
      "Couldn't find the master's price in this line. Is it written in a form the tool " +
        "can't read (kanji numerals), or is it missing?",
    );
  });
  it("a_currency_only_the_translation_has_stays_certain", () => {
    const r = checkCurrency(aPair("Free shipping", "Gratisversand ab 50 \u20ac"), ctx());
    expect(r.currency_code?.findings[0]).toMatchObject({ confidence: "certain", found: "EUR" });
  });
});

describe("numbers rows pair by kind first", () => {
  it("pairs_a_changed_time_with_a_time_and_a_stray_number_alone", () => {
    expect(numberRows("Ends 9 PM", "Fin \u00e0 22:00, 24 articles", "fr-FR")).toEqual([
      ["21:00", "22:00"],
      [null, "24"],
    ]);
  });

  it("pairs_what_each_kind_leaves_over_by_position", () => {
    expect(numberRows("16:10 display", "\u00e9cran 16/10", "fr-FR")).toEqual([
      ["16:10", "16"],
      [null, "10"],
    ]);
  });
});
