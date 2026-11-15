import { describe, expect, it } from "vitest";
import { findArtifacts } from "../../../src/domain/artifacts";
import { mergeTagSource } from "../../../src/domain/tokens/merge-tags";
import { promoPattern } from "../../../src/domain/tokens/promo-codes";
import {
  alternation,
  alternatives,
  anyCase,
  anyChar,
  escape,
  longestFirst,
  termSource,
} from "../../../src/domain/tokens/regex";
import { testRules } from "../../support/rules";

const whole = (source: string) => new RegExp(`^(?:${source})$`, "u");

describe("shared regex sources", () => {
  it("escapes_slashes_and_brackets", () => {
    expect(escape("a/b (c)")).toBe("a\\/b \\(c\\)");
  });

  it("artifacts_escape_phrases_with_the_shared_escaper", () => {
    expect(findArtifacts("x (at least one needed)", testRules())).toEqual([
      "(at least one needed)",
    ]);
  });

  it("sorts_names_longest_first", () => {
    expect(longestFirst(["Pro", "TrailPro Ultra", "TrailPro"])).toEqual([
      "TrailPro Ultra",
      "TrailPro",
      "Pro",
    ]);
  });

  it("an_alternation_of_no_names_matches_nothing", () => {
    expect(new RegExp(alternation([]), "u").test("")).toBe(false);
  });

  it.each(["Black Friday", "Black\u00a0Friday", "Black-Friday", "Black \u202f Friday"])(
    "joins_term_words_by_spaces_or_hyphens_%#",
    (text) => {
      expect(whole(termSource("Black Friday")).test(text)).toBe(true);
    },
  );

  it("does_not_join_term_words_without_a_separator", () => {
    expect(whole(termSource("Black Friday")).test("BlackFriday")).toBe(false);
  });

  it("matches_merge_tags_case_sensitively", () => {
    const tag = new RegExp(mergeTagSource(testRules()), "u");
    expect([tag.test("*|FNAME|*"), tag.test("*|fname|*")]).toEqual([true, false]);
  });

  it("builds_the_promo_pattern_from_rules", () => {
    expect("Use BF26 or bf26".match(promoPattern(testRules()))).toEqual(["BF26"]);
  });

  it("keeps_the_names_as_written_longest_first_in_alternatives", () => {
    expect(alternatives(["a", "\uff21b", "c.d"])).toBe("c\\.d|\uff21b|a");
  });

  it("an_alternation_normalizes_each_name_to_nfkc", () => {
    expect(alternation(["\uff21b"])).toBe("Ab");
  });

  it("alternatives_of_no_names_match_nothing", () => {
    expect(new RegExp(alternatives([]), "u").test("")).toBe(false);
  });

  it("puts_characters_in_one_class_and_matches_nothing_without_any", () => {
    expect([anyChar([":", "-", "\u3001"]), new RegExp(anyChar([]), "u").test("")]).toEqual([
      "[:\\-\u3001]",
      false,
    ]);
  });

  it("matches_an_ascii_word_in_any_case_but_never_a_lookalike", () => {
    const https = new RegExp(`^${anyCase("https")}$`, "u");
    expect(["HtTpS", "http\u017f"].map((t) => https.test(t))).toEqual([true, false]);
  });
});
