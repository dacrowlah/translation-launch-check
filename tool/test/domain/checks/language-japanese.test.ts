import { describe, expect, it } from "vitest";
import { checkLanguageColumn, checkLanguageLine } from "../../../src/domain/checks/language.js";
import type { LocaleContext } from "../../../src/domain/checks/compare.js";
import { aPair, ctx } from "../../support/builders.js";
import { testRules } from "../../support/rules.js";

/** The script rule: Japanese characters in ja copy, none in latin-script copy. */
const FR_LINES = ["Achetez maintenant et profitez de nos offres", "Livraison gratuite partout"];
const JA = "\u30c8\u30ec\u30a4\u30eb\u30b7\u30e5\u30fc\u30ba\u3092\u4eca\u3059\u3050\u8cfc\u5165";
const LONG_FR = "Profitez de nos offres exceptionnelles cette semaine";
const SALE_JA = "\u30bb\u30fc\u30eb\u958b\u50ac\u4e2d";
const OFU = "\u30aa\u30d5";
const NEW_IN = "\u65b0\u7740";
const BUY_NOW = "\u4eca\u3059\u3050\u8cfc\u5165";
const CHECK_NOW = "\u4eca\u3059\u3050\u30c1\u30a7\u30c3\u30af";
/** Twelve Japanese letters and eight latin ones: 60% Japanese. */
const SIXTY_JA = `${SALE_JA}${SALE_JA} Sale Sale`;
/** No line with any Japanese. */
const ALL_EN = ["Shop the best deals of the season", "Free shipping on every order", "Learn more"];
const UNSURE = {
  check: "language_column",
  severity: "warning",
  confidence: "unsure",
  detail: "The ja-JP column is mostly in Latin letters. Is it Japanese?",
  expected: null,
  found: null,
};
const BLOCKER = {
  check: "language_column",
  severity: "blocker",
  confidence: "certain",
  detail: "The ja-JP column is mostly not Japanese.",
  expected: null,
  found: null,
};

/** A ja context of the real rules with the Japanese share changed. */
const withShare = (japanese_share: number): LocaleContext => ({
  ...ctx("ja-JP"),
  rules: { ...testRules(), language_check: { ...testRules().language_check, japanese_share } },
});

describe("japanese column", () => {
  it("a_japanese_column_needs_japanese", () => {
    const bad = checkLanguageColumn(FR_LINES, ctx("ja-JP"));
    expect(bad.findings[0]).toMatchObject({ severity: "blocker" });
    expect(checkLanguageColumn([JA], ctx("ja-JP")).findings).toEqual([]);
  });
  it.each([[ALL_EN], [["SHOP NOW", "LEARN MORE"]], [["Black Friday SALE", "SHOP NOW"]]])(
    "a_column_with_no_japanese_line_is_a_blocker_%#",
    (texts) => {
      expect(checkLanguageColumn(texts, ctx("ja-JP")).findings).toEqual([BLOCKER]);
    },
  );
  it.each([
    [["SHOP NOW", "LEARN MORE", BUY_NOW]],
    [["Black Friday SALE", "\u6700\u592750%OFF", "SHOP NOW"]],
    [["Shop now", "Learn more \u69d8"]],
    [["Black Friday SALE\u958b\u50ac\u4e2d", "SHOP NOW"]],
    [["SALE\u958b\u50ac\u4e2d \u6700\u592730%OFF"]],
    [[`SALE 30%${OFU}`, `NEW ARRIVALS ${NEW_IN}`, BUY_NOW]],
    [["[SALE]\u958b\u50ac50%OFF", "NEW ARRIVALS"]],
    [[`NEW ARRIVALS ${NEW_IN}`, `SALE 30%${OFU}`, CHECK_NOW]],
    [
      [
        "Black Friday SALE\u958b\u50ac\u4e2d",
        "\u6700\u592750%OFF",
        "SHOP NOW",
        "\u9001\u6599\u7121\u6599",
      ],
    ],
  ])("latin_retail_words_beside_japanese_lines_are_a_question_not_a_blocker_%#", (texts) => {
    expect(checkLanguageColumn(texts, ctx("ja-JP")).findings).toEqual([UNSURE]);
  });
  it("the_japanese_share_comes_from_rules", () => {
    expect(checkLanguageColumn([SIXTY_JA], ctx("ja-JP")).findings).toEqual([]);
    expect(checkLanguageColumn([SIXTY_JA], withShare(0.9)).findings).toEqual([UNSURE]);
  });
});

describe("japanese in lines", () => {
  it("brand_only_japanese_line_is_not_applicable", () => {
    const pair = aPair("TrailPro", "TrailPro", "ja-JP");
    expect(checkLanguageLine(pair, ctx("ja-JP")).applicable).toBe(false);
  });
  it.each(["Black Friday SALE", "Jetzt kaufen"])(
    "a_latin_word_left_in_a_japanese_line_is_a_warning_however_short_%#",
    (text) => {
      expect(checkLanguageLine(aPair("Hi", text, "ja-JP"), ctx("ja-JP")).findings).toEqual([
        {
          check: "language_line",
          severity: "warning",
          confidence: "certain",
          detail: "This line has no Japanese characters.",
          expected: null,
          found: null,
        },
      ]);
    },
  );
  it("a_japanese_line_with_latin_words_and_japanese_has_no_finding", () => {
    const pair = aPair("SALE 30% off", "SALE 30%\u30aa\u30d5", "ja-JP");
    expect(checkLanguageLine(pair, ctx("ja-JP"))).toEqual({ applicable: true, findings: [] });
  });
  it("one_japanese_word_in_a_latin_line_is_a_warning", () => {
    const text = "Sparen Sie dieses Wochenende 30 % auf alle \u30b8\u30e3\u30b1\u30c3\u30c8";
    expect(checkLanguageLine(aPair("Hi", text), ctx("de-DE")).findings).toEqual([
      {
        check: "language_line",
        severity: "warning",
        confidence: "certain",
        detail: "This line has Japanese characters.",
        expected: null,
        found: null,
      },
    ]);
  });
  it("japanese_in_a_latin_line_is_a_warning_even_when_short", () => {
    expect(checkLanguageLine(aPair("Hi", JA), ctx("de-DE")).findings[0]).toMatchObject({
      detail: "This line reads as Japanese.",
    });
  });
  it("a_long_japanese_line_without_japanese_is_a_warning", () => {
    const pair = aPair("Hi", LONG_FR, "ja-JP");
    expect(checkLanguageLine(pair, ctx("ja-JP")).findings[0]).toMatchObject({
      detail: "This line has no Japanese characters.",
    });
    expect(checkLanguageLine(aPair("Hi", JA, "ja-JP"), ctx("ja-JP")).findings).toEqual([]);
  });
});
