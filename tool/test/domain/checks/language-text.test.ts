import { describe, expect, it } from "vitest";
import {
  candidateLanguages,
  japaneseShare,
  letterCount,
  stripForLanguage,
} from "../../../src/domain/checks/language-text.js";
import { testLocale, testRules } from "../../support/rules.js";

const strip = (text: string, locale: string): string =>
  stripForLanguage(text, testRules(), testLocale(locale));

describe("language text", () => {
  it("strips_tags_urls_codes_terms_numbers_and_symbols", () => {
    const text = "Shop {{first_name}} https://a.com/x SAVE20 20OFF TrailPro 50% off!";
    expect(strip(text, "en-US")).toBe("Shop off");
  });
  it("strips_markup_with_its_attributes", () => {
    expect(strip('<span style="color:red">Soldes !</span>', "fr-FR")).toBe("Soldes");
  });
  it("keeps_an_apostrophe_between_letters", () => {
    expect(strip("l\u2019offre d'\u00e9t\u00e9 ' ok", "fr-FR")).toBe(
      "l\u2019offre d'\u00e9t\u00e9 ok",
    );
  });
  it("strips_the_accepted_loanwords_of_the_language", () => {
    expect([strip("Online-Shop Sale", "de-DE"), strip("Bons plans shopping", "fr-FR")]).toEqual([
      "",
      "Bons plans",
    ]);
    expect(strip("Online-Shop Sale", "en-US")).toBe("Online Shop Sale");
  });
  it("counts_letters_and_japanese_share", () => {
    expect(letterCount("ab 12 \u3042")).toBe(3);
    expect(japaneseShare("ab\u3042\u30a2")).toBe(0.5);
    expect(japaneseShare("123")).toBe(0);
  });
  it("candidates_are_the_latin_languages_of_every_locale", () => {
    expect(candidateLanguages(testRules()).sort()).toEqual(["de", "en", "fr"]);
  });
});
