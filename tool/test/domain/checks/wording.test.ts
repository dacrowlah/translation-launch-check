import { describe, expect, it } from "vitest";
import { checkFormality } from "../../../src/domain/checks/formality";
import { checkGlossary } from "../../../src/domain/checks/glossary";
import { checkTimeZone } from "../../../src/domain/checks/time-zone";
import { checkTypography } from "../../../src/domain/checks/typography";
import { checkUntranslated } from "../../../src/domain/checks/untranslated";
import { aPair, ctx } from "../../support/builders";

const JA_BRAND = "\u30c8\u30ec\u30a4\u30eb\u30d7\u30ed \u30a6\u30eb\u30c8\u30e9";
const JA_BF = "\u30d6\u30e9\u30c3\u30af\u30d5\u30e9\u30a4\u30c7\u30fc\u30bb\u30fc\u30eb";

describe("formality", () => {
  it("mixed_du_in_formal_german_is_a_warning", () => {
    const pair = aPair("Discover now", "Entdecken Sie jetzt, was dir gef\u00e4llt", "de-DE");
    expect(checkFormality(pair, ctx("de-DE")).findings[0]).toMatchObject({
      check: "formality",
      severity: "warning",
      found: "dir",
    });
  });
  it("formal_only_and_marker_free_lines_have_no_finding", () => {
    expect(checkFormality(aPair("Hi", "Entdecken Sie Ihre Angebote"), ctx())).toEqual({
      applicable: true,
      findings: [],
    });
    expect(checkFormality(aPair("Hi", "Jetzt kaufen"), ctx()).applicable).toBe(false);
  });
  it("formality_not_applicable_for_japanese", () => {
    expect(checkFormality(aPair("Shop", "\u8cfc\u5165", "ja-JP"), ctx("ja-JP")).applicable).toBe(
      false,
    );
  });
  it("french_tu_is_found_but_not_inside_a_url_or_merge_tag", () => {
    const flagged = aPair("Hi", "Tu peux acheter", "fr-FR");
    expect(checkFormality(flagged, ctx("fr-FR")).findings[0]).toMatchObject({ found: "Tu" });
    const hidden = aPair("Hi", "Voyez https://a.com/tu/te {{tu}}", "fr-FR");
    expect(checkFormality(hidden, ctx("fr-FR")).findings).toEqual([]);
  });
});

describe("glossary", () => {
  it("transliterated_brand_misses_dnt", () => {
    const r = checkGlossary(aPair("TrailPro Ultra is live", JA_BRAND, "ja-JP"), ctx("ja-JP"));
    expect(r.glossary_dnt?.findings[0]).toMatchObject({
      severity: "warning",
      expected: "TrailPro Ultra",
    });
  });
  it("longest_term_wins_so_a_dropped_ultra_is_still_a_finding", () => {
    const r = checkGlossary(aPair("TrailPro Ultra", "Die TrailPro ist da"), ctx());
    expect(r.glossary_dnt?.findings).toHaveLength(1);
    expect(r.glossary_dnt?.findings[0]).toMatchObject({ expected: "TrailPro Ultra" });
  });
  it("kept_term_with_a_hyphen_passes_and_no_master_term_is_not_applicable", () => {
    expect(checkGlossary(aPair("Black Friday", "Black-Friday"), ctx()).glossary_dnt).toEqual({
      applicable: true,
      findings: [],
    });
    expect(checkGlossary(aPair("Shop", "Kaufen"), ctx()).glossary_dnt?.applicable).toBe(false);
  });
  it("approved_japanese_black_friday_passes", () => {
    const r = checkGlossary(aPair("Black Friday Sale", JA_BF, "ja-JP"), ctx("ja-JP"));
    expect(r.glossary_dnt?.findings).toEqual([]);
  });
  it("forbidden_term_is_a_blocker", () => {
    const r = checkGlossary(
      aPair("Great prices", "Prix le plus bas garanti", "fr-FR"),
      ctx("fr-FR"),
    );
    expect(r.glossary_forbidden?.findings[0]).toMatchObject({
      severity: "blocker",
      found: "garanti",
    });
  });
  it("forbidden_match_is_whole_word_and_ignores_case_and_urls", () => {
    const hit = checkGlossary(aPair("Hi", "GARANTIERT sicher"), ctx());
    expect(hit.glossary_forbidden?.findings).toHaveLength(1);
    const miss = checkGlossary(aPair("Hi", "Garantiertes gibt es https://a.com/garantiert"), ctx());
    expect(miss.glossary_forbidden).toEqual({ applicable: true, findings: [] });
  });
});

describe("untranslated, typography and time zone", () => {
  it("identical_line_is_untranslated", () => {
    const same = aPair("Black Friday Sale: shop now", "Black Friday Sale: shop now");
    expect(checkUntranslated(same, ctx()).findings).toHaveLength(1);
    expect(
      checkUntranslated(aPair("Black Friday Sale", "Black Friday Sale"), ctx()).applicable,
    ).toBe(false);
  });
  it("translated_or_number_only_differences_decide_untranslated", () => {
    expect(checkUntranslated(aPair("Shop now", "Jetzt kaufen"), ctx()).findings).toEqual([]);
    const same = aPair("Shop now 20% off", "Shop now 30 % off");
    expect(checkUntranslated(same, ctx()).findings).toHaveLength(1);
  });
  it("en_gb_copy_equal_to_master_is_not_untranslated", () => {
    expect(checkUntranslated(aPair("Shop now", "Shop now", "en-GB"), ctx("en-GB")).applicable).toBe(
      false,
    );
  });
  it("french_colon_without_space_is_info", () => {
    const bare = aPair("Offer: today", "Offre: aujourd'hui", "fr-FR");
    expect(checkTypography(bare, ctx("fr-FR")).findings[0]?.severity).toBe("info");
    const spaced = aPair("Offer: today", "Offre\u202f: aujourd'hui", "fr-FR");
    expect(checkTypography(spaced, ctx("fr-FR")).findings).toEqual([]);
  });
  it("french_typography_skips_times_and_urls_and_checks_guillemets", () => {
    const skipped = aPair("At 9:30", "A 9:30 sur https://a.com/x?y=1", "fr-FR");
    expect(checkTypography(skipped, ctx("fr-FR")).findings).toEqual([]);
    const tight = aPair("Say hi", "Dites \u00abbonjour\u00bb", "fr-FR");
    expect(checkTypography(tight, ctx("fr-FR")).findings).toHaveLength(2);
    const roomy = aPair("Say hi", "Dites \u00ab\u202fbonjour\u202f\u00bb", "fr-FR");
    expect(checkTypography(roomy, ctx("fr-FR")).findings).toEqual([]);
  });
  it("typography_is_not_applicable_outside_french", () => {
    expect(checkTypography(aPair("Offer: x", "Angebot: x"), ctx()).applicable).toBe(false);
  });
  it("deadline_without_time_zone_is_a_warning", () => {
    const bare = checkTimeZone(aPair("Ends at midnight", "Endet um Mitternacht"), ctx());
    expect(bare.findings[0]).toMatchObject({ check: "time_zone", severity: "warning" });
    const zoned = aPair("Ends 23:59 CET", "Endet um 23:59 Uhr MEZ");
    expect(checkTime(zoned).findings).toEqual([]);
    expect(checkTime(aPair("Shop now", "Jetzt kaufen")).applicable).toBe(false);
  });
  it("zone_codes_are_case_sensitive_whole_words", () => {
    expect(checkTime(aPair("x", "Endet um 23:59 Uhr met")).findings).toHaveLength(1);
    expect(checkTime(aPair("x", "Endet um 23:59 Uhr CETA")).findings).toHaveLength(1);
    expect(checkTime(aPair("x", "Endet um 23:59 Uhr deutscher ZEIT")).findings).toHaveLength(0);
    expect(checkTime(aPair("x", "Endet um 23:59 https://a.com/CET")).findings).toHaveLength(1);
  });
});

const checkTime = (pair: ReturnType<typeof aPair>) => checkTimeZone(pair, ctx());
