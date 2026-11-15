import { describe, expect, it } from "vitest";
import { rewriteVisible, visibleTerms } from "../../../src/domain/checks/spans.js";
import { spellingFix } from "../../../src/domain/checks/spelling.js";
import { LATIN_WORD } from "../../../src/domain/checks/words.js";
import { respelled } from "../../support/builders.js";
import { testRules } from "../../support/rules.js";

const TD = '<td align="center" style="color:#333">Our favorite colors</td>';
const swiss = (text: string) =>
  rewriteVisible(text, testRules(), LATIN_WORD, (w) => w.replace(/\u00df/gu, "ss"));

describe("urls and merge tags as spans", () => {
  it("protects_only_capital_mailchimp_tags_so_lowercase_text_is_copy", () => {
    expect(spellingFix("*|fname|* color", "en-GB", testRules()).fixed).toBe("*|fname|* colour");
    expect(visibleTerms("*|FNAME|* and *|fname|*", testRules())).toBe("and *|fname|*");
  });

  it("keeps_anchor_text_and_drops_the_tag_with_its_href", () => {
    expect(visibleTerms('<a href="https://x.com/a">Garantiert</a>', testRules())).toBe(
      "Garantiert",
    );
  });

  it("keeps_promo_codes_and_do_not_translate_terms_as_copy", () => {
    expect(visibleTerms("<b>TrailPro</b> code BF26 &amp; more", testRules())).toBe(
      "TrailPro code BF26 & more",
    );
  });
});

describe("rewriting visible text only", () => {
  it("rewrites_the_copy_and_keeps_the_markup_byte_for_byte", () => {
    expect(respelled(TD)).toBe('<td align="center" style="color:#333">Our favourite colours</td>');
  });

  it.each([
    "Use code COLOR20 today.",
    "Email favorites@example.com",
    "Shop at www.example.com/colors now",
    "Visit example.com/colors",
    "Shop https://shop.example.co.uk/caf\u00e9/colors now",
    "See https://x.com/men's-colors",
  ])("leaves_protected_tokens_alone_%#", (text) => {
    expect(respelled(text)).toBe(text);
  });

  it.each(["stra\u00dfe@example.ch", "Visit https://shop.ch/stra\u00dfe now"])(
    "leaves_a_sharp_s_in_an_email_or_link_alone_%#",
    (text) => {
      expect(swiss(text)).toBe(text);
    },
  );

  it("rewrites_a_sharp_s_in_copy", () => {
    expect(swiss("Stra\u00dfe")).toBe("Strasse");
  });

  it("leaves_a_do_not_translate_term_alone", () => {
    const rules = {
      ...testRules(),
      glossary: { ...testRules().glossary, do_not_translate: ["Center Parcs"] },
    };
    expect(respelled("Center Parcs centers", rules)).toBe("Center Parcs centres");
  });

  it("rewrites_a_word_before_sentence_punctuation", () => {
    expect(respelled("Great colors.")).toBe("Great colours.");
  });

  it("never_rewrites_part_of_a_word", () => {
    expect(respelled("colors_x xcolors colors2")).toBe("colors_x xcolors colors2");
  });
});

describe("text glued to a token is part of the token", () => {
  it("never_rewrites_a_word_that_touches_a_link_or_merge_tag", () => {
    expect(respelled("{{name}}colors and https://x.com/a?b=c)colors")).toBe(
      "{{name}}colors and https://x.com/a?b=c)colors",
    );
  });

  it("rewrites_a_word_that_touches_a_tag", () => {
    expect(respelled("<b>colors</b>")).toBe("<b>colours</b>");
  });

  it("spelling_never_rewrites_a_link_or_a_bare_domain", () => {
    const fix = (text: string) => spellingFix(text, "en-GB", testRules()).fixed;
    expect([fix("Visit example.com/colors"), fix("See https://x.com/men's-colors")]).toEqual([
      "Visit example.com/colors",
      "See https://x.com/men's-colors",
    ]);
  });
});
