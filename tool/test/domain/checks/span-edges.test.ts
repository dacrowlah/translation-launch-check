import { describe, expect, it } from "vitest";
import { protectedSpans } from "../../../src/domain/checks/spans";
import type { Rules } from "../../../src/domain/rules";
import { respelled, visibleIn } from "../../support/builders";
import { testRules } from "../../support/rules";

const spans = (text: string, rules: Rules = testRules()) => protectedSpans(text, rules);

describe("emails and bare domains", () => {
  it.each(["Mail Colors@Shop.COM now", "Visit Shop.Example.COM/colors today"])(
    "an_upper_case_top_level_domain_is_still_a_link_%#",
    (text) => {
      expect(respelled(text)).toBe(text);
    },
  );

  it("a_missing_space_after_a_full_stop_is_no_domain", () => {
    expect(visibleIn("Kaufen Sie jetzt.nur heute")).toBe("Kaufen Sie jetzt.nur heute");
  });

  it.each([
    ["Visit example.com/colors.", "Visit ."],
    ["See https://x.com/colors!", "See !"],
  ])("a_link_span_leaves_its_trailing_punctuation_as_copy_%#", (text, expected) => {
    expect(visibleIn(text)).toBe(expected);
  });

  it.each(["Gratis z.B.bei colors", "Gratis i.e.in colors"])(
    "one_letter_abbreviations_without_spaces_are_no_domain_%#",
    (text) => {
      expect(visibleIn(text)).toBe(text);
    },
  );

  it("a_domain_with_a_subdomain_needs_no_path", () => {
    expect(spans("Visit shop.example.com today")).toEqual(["shop.example.com"]);
  });
});

describe("tags that hold a > and comments", () => {
  it.each([
    ['<p title="a > b">Hallo</p>', "Hallo"],
    ["<p title='a > b'>Hallo</p>", "Hallo"],
    ["<!-- a > b --> Hallo", "Hallo"],
  ])("drops_the_whole_tag_or_comment_%#", (text, expected) => {
    expect(visibleIn(text)).toBe(expected);
  });
});

describe("spaces where a span was", () => {
  it("keeps_a_no_break_space_next_to_a_removed_tag", () => {
    expect(visibleIn("Sparen Sie <strong>20</strong>&nbsp;%")).toBe("Sparen Sie 20\u00a0%");
  });

  it("joins_plain_spaces_around_a_removed_tag_into_one", () => {
    expect(visibleIn("Sparen <b> </b> Sie")).toBe("Sparen Sie");
  });
});

describe("terms are matched as written", () => {
  it("protects_a_do_not_translate_term_that_nfkc_would_change", () => {
    const rules = {
      ...testRules(),
      glossary: { ...testRules().glossary, do_not_translate: ["TrailPro\u2122"] },
    };
    expect(spans("TrailPro\u2122 colors", rules)).toEqual(["TrailPro\u2122"]);
  });
});
