import { describe, expect, it } from "vitest";
import { checkLocaleSpelling } from "../../../src/domain/checks/locale-spelling.js";
import { checkMarkup } from "../../../src/domain/checks/markup.js";
import { checkPromoCodes } from "../../../src/domain/checks/promo-codes.js";
import { spellingFix } from "../../../src/domain/checks/spelling.js";
import { checkUrls } from "../../../src/domain/checks/urls.js";
import { aPair, ctx } from "../../support/builders.js";
import { testRules } from "../../support/rules.js";

const gb = (text: string) => spellingFix(text, "en-GB", testRules());

/** en-GB lines with markup, a link, a merge tag or a code, and the fix code builds for each. */
const FIXES: [string, string][] = [
  [
    '<td align="center" style="color:#333">Our favorite colors</td>',
    '<td align="center" style="color:#333">Our favourite colours</td>',
  ],
  ['<a href="https://x.com/colors">Colors</a>', '<a href="https://x.com/colors">Colours</a>'],
  [
    "Shop https://x.com/colors?c=gray in every color",
    "Shop https://x.com/colors?c=gray in every colour",
  ],
  ["Hi {{favorite_color}}, new colors", "Hi {{favorite_color}}, new colours"],
  ["Code COLOR20: all colors", "Code COLOR20: all colours"],
];

describe("market spelling", () => {
  it("us_spellings_in_en_gb_get_the_uk_line", () => {
    expect(gb("Our favorite colors, organized at the Center").fixed).toBe(
      "Our favourite colours, organised at the Centre",
    );
    const r = checkLocaleSpelling(aPair("Shop colors", "Shop colors", "en-GB"), ctx("en-GB"));
    expect(r.findings[0]).toMatchObject({
      check: "locale_spelling",
      severity: "warning",
      found: "colors",
      expected: "colours",
    });
  });
  it("one_finding_lists_every_word_found", () => {
    const r = checkLocaleSpelling(aPair("x", "Gray colors", "en-GB"), ctx("en-GB"));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ found: "Gray, colors", expected: "Grey, colours" });
  });
  it("replacements_keep_the_words_case", () => {
    expect(gb("color Color COLOR").fixed).toBe("colour Colour COLOUR");
    expect(gb("ORGANIZE Realize").fixed).toBe("ORGANISE Realise");
  });
  it("only_whole_words_change", () => {
    expect(gb("Colorado colorful centerpiece").fixed).toBe("Colorado colourful centerpiece");
  });
  it("urls_and_merge_tags_are_left_alone", () => {
    const text = "See https://a.com/color/organize {{color}} colors";
    expect(gb(text).fixed).toBe("See https://a.com/color/organize {{color}} colours");
  });
  it("size_and_prize_are_not_changed", () => {
    expect(gb("Win a prize in every size").changes).toEqual([]);
    expect(gb("Seized capsized maize sizes").changes).toEqual([]);
  });
  it("ize_words_change_in_every_form", () => {
    expect(gb("organizes organized organizing organization").fixed).toBe(
      "organises organised organising organisation",
    );
    expect(gb("Realize").changes).toEqual([["Realize", "Realise"]]);
  });
  it("valid_uk_spellings_judgment_and_acknowledgment_are_not_changed", () => {
    expect(gb("Use your judgment; acknowledgment sent").changes).toEqual([]);
  });
  it("short_ize_words_are_not_changed", () => {
    expect(gb("Ize unize").changes).toEqual([]);
  });
  it("clean_text_comes_back_unchanged", () => {
    expect(gb("Shop the sale")).toEqual({ fixed: "Shop the sale", changes: [] });
    const r = checkLocaleSpelling(aPair("x", "Shop the sale", "en-GB"), ctx("en-GB"));
    expect(r).toEqual({ applicable: true, findings: [] });
  });
  it("sharp_s_in_de_ch_becomes_ss", () => {
    expect(spellingFix("Gr\u00fc\u00dfe aus der Stra\u00dfe", "de-CH", testRules()).fixed).toBe(
      "Gr\u00fcsse aus der Strasse",
    );
    const pair = aPair("Street", "Stra\u00dfe", "de-DE");
    expect(checkLocaleSpelling(pair, ctx("de-DE")).applicable).toBe(false);
  });
  it("de_ch_finding_names_the_whole_word", () => {
    const r = checkLocaleSpelling(aPair("Street", "Stra\u00dfe", "de-CH"), ctx("de-CH"));
    expect(r.findings[0]).toMatchObject({ found: "Stra\u00dfe", expected: "Strasse" });
  });
});

describe("market spelling reads the visible copy only", () => {
  it.each([
    ["en-GB", "Use code COLOR20 today."],
    ["en-GB", "Email favorites@example.com"],
    ["en-GB", "Shop at www.example.com/colors now"],
    ["de-CH", "Schreiben Sie an stra\u00dfe@example.ch"],
  ])("a_word_inside_a_code_email_or_link_is_no_finding_%#", (locale, text) => {
    expect(checkLocaleSpelling(aPair("x", text, locale), ctx(locale))).toEqual({
      applicable: true,
      findings: [],
    });
  });
  it.each(FIXES)("the_fix_keeps_markup_links_tags_and_terms_byte_for_byte_%#", (text, fixed) => {
    const r = checkLocaleSpelling(aPair("x", text, "en-GB"), ctx("en-GB"));
    expect(r.fix).toBe(fixed);
  });
  it.each(FIXES)("a_fixed_line_rechecks_with_no_structure_finding_%#", (text, fixed) => {
    const pair = aPair(text, fixed, "en-GB");
    const results = [checkMarkup(pair, ctx("en-GB")), checkPromoCodes(pair, ctx("en-GB"))];
    const urls = Object.values(checkUrls(pair, ctx("en-GB")));
    expect([...results, ...urls].flatMap((r) => r?.findings ?? [])).toEqual([]);
  });
  it("the_fix_keeps_a_do_not_translate_term_as_written", () => {
    const rules = testRules();
    const glossary = { ...rules.glossary, do_not_translate: ["Color Lab"] };
    const c = { ...ctx("en-GB"), rules: { ...rules, glossary } };
    const r = checkLocaleSpelling(aPair("x", "Color Lab colors in gray", "en-GB"), c);
    expect(r.fix).toBe("Color Lab colours in grey");
  });
  it("a_plain_line_gets_the_fix", () => {
    const r = checkLocaleSpelling(aPair("x", "Our favorite colors", "en-GB"), ctx("en-GB"));
    expect(r.fix).toBe("Our favourite colours");
  });
});
