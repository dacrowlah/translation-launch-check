import { describe, expect, it } from "vitest";
import { checkLocaleSpelling } from "../../../src/domain/checks/locale-spelling";
import { spellingFix } from "../../../src/domain/checks/spelling";
import { aPair, ctx } from "../../support/builders";
import { testRules } from "../../support/rules";

const gb = (text: string) => spellingFix(text, "en-GB", testRules());

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
