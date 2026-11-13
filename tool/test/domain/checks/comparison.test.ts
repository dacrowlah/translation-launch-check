import { describe, expect, it } from "vitest";
import { checkCurrency } from "../../../src/domain/checks/money";
import { checkMergeTags } from "../../../src/domain/checks/merge-tags";
import { checkNumbers } from "../../../src/domain/checks/numbers";
import { checkPromoCodes } from "../../../src/domain/checks/promo-codes";
import { checkUrls } from "../../../src/domain/checks/urls";
import { aPair, ctx } from "../../support/builders";

describe("numbers, merge tags, promo codes", () => {
  it("flags_a_changed_percentage", () => {
    const r = checkNumbers(aPair("30% off all jackets", "20 % auf alle Jacken"), ctx("de-DE"));
    expect(r.findings).toEqual([
      {
        check: "numbers",
        severity: "blocker",
        detail: "A number differs from the master.",
        expected: "30",
        found: "20",
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
});
