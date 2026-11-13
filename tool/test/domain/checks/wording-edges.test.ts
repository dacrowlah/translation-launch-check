import { describe, expect, it } from "vitest";
import { checkFormality } from "../../../src/domain/checks/formality";
import { checkGlossary } from "../../../src/domain/checks/glossary";
import { checkLocaleSpelling } from "../../../src/domain/checks/locale-spelling";
import { spellingFix } from "../../../src/domain/checks/spelling";
import { checkTimeZone } from "../../../src/domain/checks/time-zone";
import { checkTypography } from "../../../src/domain/checks/typography";
import { checkUntranslated } from "../../../src/domain/checks/untranslated";
import { aPair, ctx } from "../../support/builders";
import { testLocale, testRules } from "../../support/rules";

const JA_SLUG =
  "\u30c8\u30ec\u30a4\u30eb\u30d7\u30ed \u30a6\u30eb\u30c8\u30e9 https://x.com/trailpro-ultra";

describe("wording edge cases", () => {
  it("a_repeated_informal_marker_is_named_once", () => {
    const pair = aPair("Hi", "Entdecken Sie, was dir und dir gef\u00e4llt");
    expect(checkFormality(pair, ctx()).findings[0]).toMatchObject({ found: "dir" });
  });
  it("two_informal_markers_are_listed_together", () => {
    const pair = aPair("Hi", "Entdecken Sie, was dir und dich freut");
    expect(checkFormality(pair, ctx()).findings[0]).toMatchObject({ found: "dir, dich" });
  });
  it("a_dropped_prefix_term_is_a_finding_of_its_own", () => {
    const r = checkGlossary(aPair("TrailPro Ultra", "Die Ultra-Marke"), ctx());
    expect(r.glossary_dnt?.findings).toHaveLength(1);
  });
  it("glossary_forbidden_is_not_applicable_without_a_list", () => {
    const r = checkGlossary(aPair("Hi", "Hi", "en-US"), ctx("en-US"));
    expect(r.glossary_forbidden?.applicable).toBe(false);
  });
  it("untranslated_ignores_case_and_symbols", () => {
    expect(checkUntranslated(aPair("Shop now", "SHOP NOW"), ctx()).findings).toHaveLength(1);
    expect(checkUntranslated(aPair("Shop + save", "Shop save"), ctx()).findings).toHaveLength(1);
  });
  it("guillemets_are_checked_only_when_the_rule_says_so", () => {
    const rule = { ...testLocale("fr-FR"), typography: { space_before: [";"], guillemets: false } };
    const base = ctx("fr-FR");
    const rules = { ...base.rules, locales: { ...base.rules.locales, "fr-FR": rule } };
    const pair = aPair("Say hi", "Dites \u00abbonjour\u00bb", "fr-FR");
    expect(checkTypography(pair, { ...base, rules }).findings).toEqual([]);
  });
  it("lower_case_zone_codes_do_not_count", () => {
    const pair = aPair("x", "Endet um 23:59 Uhr cet");
    expect(checkTimeZone(pair, ctx()).findings).toHaveLength(1);
  });
  it("zone_phrases_ignore_case", () => {
    const pair = aPair("x", "Endet um 23:59 Uhr DEUTSCHER ZEIT");
    expect(checkTimeZone(pair, ctx()).findings).toEqual([]);
  });
  it("time_phrases_ignore_case", () => {
    expect(checkTimeZone(aPair("x", "MITTERNACHT"), ctx()).findings).toHaveLength(1);
  });
  it("spelling_findings_list_words_with_a_comma_and_space", () => {
    const r = checkLocaleSpelling(aPair("x", "Gray colors", "en-GB"), ctx("en-GB"));
    expect(r.findings[0]?.expected).toBe("Grey, colours");
  });
  it("a_url_slug_does_not_count_as_the_kept_term", () => {
    const pair = aPair("TrailPro Ultra https://x.com/trailpro-ultra", JA_SLUG, "ja-JP");
    const r = checkGlossary(pair, ctx("ja-JP"));
    expect(r.glossary_dnt?.findings[0]).toMatchObject({ expected: "TrailPro Ultra" });
  });
  it("a_term_only_inside_the_master_url_is_not_a_master_term", () => {
    const pair = aPair("Shop https://x.com/trailpro-ultra", "Kaufen https://x.com/trailpro-ultra");
    expect(checkGlossary(pair, ctx()).glossary_dnt?.applicable).toBe(false);
  });
  it("accepted_loanwords_and_terms_alone_are_not_untranslated", () => {
    const sale = checkUntranslated(aPair("Black Friday Sale", "Black Friday Sale"), ctx());
    expect(sale).toEqual({ applicable: false, findings: [] });
  });
  it("other_words_kept_in_german_are_untranslated", () => {
    expect(checkUntranslated(aPair("Checkout", "Checkout"), ctx()).findings).toHaveLength(1);
    expect(checkUntranslated(aPair("Shop now", "Shop now"), ctx()).findings).toHaveLength(1);
  });
  it("french_loanwords_come_from_the_french_list", () => {
    const shopping = checkUntranslated(aPair("Shopping", "Shopping", "fr-FR"), ctx("fr-FR"));
    expect(shopping.applicable).toBe(false);
    const sale = checkUntranslated(aPair("Sale", "Sale", "fr-FR"), ctx("fr-FR"));
    expect(sale.findings).toHaveLength(1);
  });
  it("us_oversize_words_are_left_but_emphasize_changes", () => {
    expect(spellingFix("Oversized jackets", "en-GB", testRules()).fixed).toBe("Oversized jackets");
    expect(spellingFix("We emphasize", "en-GB", testRules()).fixed).toBe("We emphasise");
  });
  it("short_french_hours_need_a_cue_but_long_ones_do_not", () => {
    const fr = (text: string) => checkTimeZone(aPair("x", text, "fr-FR"), ctx("fr-FR"));
    expect(fr("Livraison en 24h").applicable).toBe(false);
    expect(fr("Exp\u00e9di\u00e9 sous 48 h").applicable).toBe(false);
    expect(fr("Jusqu'\u00e0 23h59").findings).toHaveLength(1);
    expect(fr("Rendez-vous \u00e0 20 h").findings).toHaveLength(1);
  });
  it("time_words_inside_longer_words_are_not_times", () => {
    expect(checkTimeZone(aPair("x", "Nachmittag"), ctx()).applicable).toBe(false);
    expect(checkTimeZone(aPair("x", "Good afternoon", "en-GB"), ctx("en-GB")).applicable).toBe(
      false,
    );
  });
  it("sichere_zahlung_is_not_informal", () => {
    expect(checkFormality(aPair("x", "Sichere Zahlung mit PayPal"), ctx()).applicable).toBe(false);
  });
  it("a_mark_after_another_mark_needs_no_space", () => {
    const fr = (text: string) => checkTypography(aPair("x", text, "fr-FR"), ctx("fr-FR"));
    expect(fr("Vraiment ?!").findings).toEqual([]);
    expect(fr("Vraiment?!").findings).toHaveLength(1);
  });
});
