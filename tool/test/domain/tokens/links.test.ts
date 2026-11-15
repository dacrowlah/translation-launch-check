import { describe, expect, it } from "vitest";
import { extractUrls } from "../../../src/domain/tokens/urls.js";
import { linksIn, visibleIn } from "../../support/builders.js";
import { urlRows } from "../../support/rows.js";

describe("a link in running text ends at hiragana, CJK punctuation or a space", () => {
  it.each([
    [
      "\u8a73\u3057\u304f\u306fhttps://example.jp/\u3092\u3054\u89a7\u304f\u3060\u3055\u3044",
      "https://example.jp/",
    ],
    ["https://example.jp/sale/\u304b\u3089", "https://example.jp/sale/"],
    ["https://example.jp/\u3092\u3054\u89a7\u304f\u3060\u3055\u3044", "https://example.jp/"],
    [
      "https://example.jp/\u30bb\u30fc\u30eb?utm_source=email",
      "https://example.jp/\u30bb\u30fc\u30eb?utm_source=email",
    ],
    ["https://example.jp/\u5927\u962a\u3067", "https://example.jp/\u5927\u962a"],
    [
      "https://example.jp/s?q=\u30bb\u30fc\u30eb&utm_source=email\u3001\u4eca\u3059\u3050",
      "https://example.jp/s?q=\u30bb\u30fc\u30eb&utm_source=email",
    ],
  ])("ends_at_hiragana_cjk_punctuation_or_a_space_%#", (text, raw) => {
    expect(linksIn(text)).toEqual([raw]);
  });

  it("a_link_followed_by_a_particle_is_the_same_link", () => {
    const target =
      "\u8a73\u3057\u304f\u306fhttps://example.jp/\u3092\u3054\u89a7\u304f\u3060\u3055\u3044";
    expect(urlRows("Details at https://example.jp/", target, "ja-JP")).toEqual([[], []]);
  });

  it("a_link_to_another_page_before_a_particle_is_a_path_change", () => {
    const target = "https://example.jp/sale/\u304b\u3089";
    expect(urlRows("From https://example.jp/", target, "ja-JP")[1]).toEqual([["/", "/sale/"]]);
  });

  it("keeps_the_japanese_copy_after_a_link_visible", () => {
    const text =
      "\u8a73\u3057\u304f\u306fhttps://example.jp/\u3092\u3054\u89a7\u304f\u3060\u3055\u3044";
    expect(visibleIn(text)).toBe(
      "\u8a73\u3057\u304f\u306f \u3092\u3054\u89a7\u304f\u3060\u3055\u3044",
    );
  });
});

describe("a quoted href runs to its closing quote", () => {
  const SALE = "https://example.jp/\u30bb\u30fc\u30eb?utm_source=email";
  /** Hiragana in the path: only the quoted form keeps the query (running text ends at it). */
  const GUIDE = "https://example.jp/\u30bb\u30fc\u30eb\u306e\u3054\u6848\u5185?utm_source=email";
  const href = (url: string) => `<a href="${url}">\u30bb\u30fc\u30eb</a>`;
  const pairRows = (master: string, target: string) => urlRows(master, target, "ja-JP");

  it.each([
    [href(GUIDE), GUIDE],
    [
      "<a href='https://example.com/sale\u2013deals?utm_source=email'>",
      "https://example.com/sale\u2013deals?utm_source=email",
    ],
    ['<a href="https://example.com/a b?x=1">', "https://example.com/a b?x=1"],
    ['<a href="https://example.com/sale.">', "https://example.com/sale."],
  ])("keeps_every_character_up_to_the_quote_%#", (text, raw) => {
    expect(linksIn(text)).toEqual([raw]);
  });

  it("a_changed_campaign_in_a_japanese_href_is_a_parameter_finding", () => {
    const target = href(GUIDE.replace("email", "mail"));
    expect(pairRows(href(GUIDE), target)[0]).toEqual([["utm_source=email", "utm_source=mail"]]);
  });

  it("a_dropped_campaign_in_a_japanese_link_is_a_parameter_finding", () => {
    const target =
      "https://example.jp/\u30bb\u30fc\u30eb \u3067\u30b7\u30e7\u30c3\u30d4\u30f3\u30b0";
    expect(pairRows(`Shop ${SALE}`, target)[0]).toEqual([["utm_source=email", null]]);
  });

  it("an_encoded_path_and_the_same_path_in_japanese_are_the_same_page", () => {
    const master = "https://example.jp/%E3%82%BB%E3%83%BC%E3%83%AB";
    expect(pairRows(master, "https://example.jp/\u30bb\u30fc\u30eb")).toEqual([[], []]);
  });
});

describe("one link pattern for tokens and spans", () => {
  it.each(["&#38;", "&#x26;", "&amp;", "&#038;", "&#x0026;"])(
    "reads_an_encoded_ampersand_in_a_query_%#",
    (amp) => {
      expect(extractUrls(`https://x.com/?a=1${amp}b=2`).urls[0]?.query).toEqual([
        ["a", "1"],
        ["b", "2"],
      ]);
    },
  );

  it("the_span_of_a_link_ends_at_a_reference_like_its_token", () => {
    expect(visibleIn("Visit https://x.com/sale&nbsp;heute now")).toBe("Visit\u00a0heute now");
  });

  it("the_span_of_a_bare_domain_ends_at_a_reference", () => {
    expect(visibleIn("Visit example.com/sale&nbsp;heute now")).toBe("Visit\u00a0heute now");
  });
});
