import { describe, expect, it } from "vitest";
import { checkFormality } from "../../../src/domain/checks/formality";
import { checkGlossary } from "../../../src/domain/checks/glossary";
import { checkLocaleSpelling } from "../../../src/domain/checks/locale-spelling";
import { checkTimeZone } from "../../../src/domain/checks/time-zone";
import { checkTypography } from "../../../src/domain/checks/typography";
import { checkUntranslated } from "../../../src/domain/checks/untranslated";
import { aPair, ctx } from "../../support/builders";
import { testLocale } from "../../support/rules";

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
});
