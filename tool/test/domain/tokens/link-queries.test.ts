import { describe, expect, it } from "vitest";
import { visibleText } from "../../../src/domain/checks/spans.js";
import { linksIn } from "../../support/builders.js";
import { testRules } from "../../support/rules.js";
import { urlRows } from "../../support/rows.js";

const linkRows = (master: string, target: string, locale = "ja-JP") =>
  urlRows(master, target, locale);
const SALE = "https://example.jp/sale?utm_source=email";
const SEARCH = "https://example.jp/s?q=";
const KATAKANA = "\u30bb\u30fc\u30eb";
const ENCODED = "%E3%82%BB%E3%83%BC%E3%83%AB";

describe("a running-text query value continues through katakana and kanji", () => {
  it.each([
    [`${SEARCH}${KATAKANA}`, `${SEARCH}${KATAKANA}`],
    [`${SEARCH}${KATAKANA} \u3067\u691c\u7d22`, `${SEARCH}${KATAKANA}`],
    [`${SEARCH}${KATAKANA}\u3092\u691c\u7d22`, `${SEARCH}${KATAKANA}`],
    ["https://example.jp/s?kw=\u5927\u798f\u888b", "https://example.jp/s?kw=\u5927\u798f\u888b"],
  ])("reads_a_japanese_query_value_to_a_space_or_hiragana_%#", (text, link) => {
    expect(linksIn(text)).toEqual([link]);
  });

  it("a_changed_japanese_query_value_is_a_parameter_finding", () => {
    expect(linkRows(`${SEARCH}${KATAKANA}`, `${SEARCH}\u30d0\u30c3\u30b0`)[0]).toEqual([
      [`q=${KATAKANA}`, "q=\u30d0\u30c3\u30b0"],
    ]);
  });

  it("an_encoded_query_value_matches_the_same_value_decoded", () => {
    expect(linkRows(`${SEARCH}${ENCODED}`, `${SEARCH}${KATAKANA}`)).toEqual([[], []]);
  });

  it("an_encoded_query_value_opposite_another_decoded_value_is_a_finding", () => {
    expect(linkRows(`${SEARCH}${ENCODED}`, `${SEARCH}\u30d0\u30c3\u30b0`)[0]).toEqual([
      [`q=${KATAKANA}`, "q=\u30d0\u30c3\u30b0"],
    ]);
  });

  it("a_katakana_query_value_before_another_parameter_is_kept", () => {
    const text = `${SEARCH}${KATAKANA}&utm_source=email`;
    expect(linksIn(text)).toEqual([text]);
  });

  it("keeps_the_hiragana_copy_after_a_query_visible", () => {
    const copy = "\u3092\u3054\u89a7\u304f\u3060\u3055\u3044";
    expect(visibleText(`${SALE}${copy}`, testRules())).toBe(copy);
  });

  it.each([
    [`${SALE}\u671f\u9593\u9650\u5b9a`, "utm_source=email\u671f\u9593\u9650\u5b9a"],
    [`${SALE}\u8a73\u7d30\u306f\u3053\u3061\u3089`, "utm_source=email\u8a73\u7d30"],
  ])("known_limitation_kanji_glued_after_a_query_value_join_the_value_%#", (target, found) => {
    expect(linkRows(`Shop ${SALE} now`, target)).toEqual([[["utm_source=email", found]], []]);
  });

  it("known_limitation_kanji_glued_after_a_path_are_part_of_the_path", () => {
    const target = "https://example.com/sale\u5927\u962a\u5e97";
    expect(linkRows("https://example.com/sale", target)[1]).toEqual([
      ["/sale", "/sale%E5%A4%A7%E9%98%AA%E5%BA%97"],
    ]);
  });
});

describe("dashes in a running-text link", () => {
  const DEALS = "https://example.com/sale-deals?utm_source=email";

  it("an_ascii_hyphen_continues_a_link", () => {
    expect(linksIn(`${DEALS} jetzt`)).toEqual([DEALS]);
  });

  it("a_changed_campaign_after_a_hyphenated_slug_is_a_parameter_finding", () => {
    expect(linkRows(DEALS, DEALS.replace("email", "mail"), "de-DE")[0]).toEqual([
      ["utm_source=email", "utm_source=mail"],
    ]);
  });

  it.each([
    ["https://example.com\u2014our new store", "https://example.com"],
    ["https://example.com/sale\u2014today only", "https://example.com/sale"],
    ["https://example.com/?utm_source=email\u2014today", "https://example.com/?utm_source=email"],
    ["https://example.com/?utm_source=email\u2013heute", "https://example.com/?utm_source=email"],
  ])("an_en_or_em_dash_ends_a_running_text_link_%#", (text, link) => {
    expect(linksIn(text)).toEqual([link]);
  });

  it.each(["\u2013", "\u2011"])(
    "a_dash_before_a_word_and_a_query_continues_the_path_%#",
    (dash) => {
      const link = `https://example.com/sale${dash}deals?utm_source=email`;
      expect(linksIn(`${link} jetzt`)).toEqual([link]);
    },
  );

  it("a_changed_campaign_after_an_en_dash_in_a_running_text_path_is_a_parameter_finding", () => {
    const link = "https://example.com/sale\u2013deals?utm_source=email";
    expect(linkRows(link, link.replace("email", "mail"), "de-DE")[0]).toEqual([
      ["utm_source=email", "utm_source=mail"],
    ]);
  });

  it("a_changed_campaign_after_an_en_dash_in_a_quoted_href_is_a_parameter_finding", () => {
    const href = (source: string) =>
      `<a href="https://example.com/sale\u2013deals?utm_source=${source}">`;
    expect(linkRows(href("email"), href("mail"), "de-DE")[0]).toEqual([
      ["utm_source=email", "utm_source=mail"],
    ]);
  });

  it("a_spaced_dash_after_a_link_ends_it", () => {
    expect(linksIn("https://example.com/sale \u2013 heute")).toEqual(["https://example.com/sale"]);
  });

  it("known_limitation_a_full_width_question_mark_ends_a_running_text_link", () => {
    expect(linksIn("https://example.jp/sale\uff1futm=1")).toEqual(["https://example.jp/sale"]);
  });
});

describe("a dash continues only a path, before a word that runs on to a link", () => {
  it.each([
    ["https://example.com\u201424/7 support", "https://example.com"],
    ["https://example.com\u2014shop/now", "https://example.com"],
    ["https://example.com/deals\u201424/7 support", "https://example.com/deals"],
    ["https://example.com/help\u2014Q&A sessions", "https://example.com/help"],
    ["https://example.com/faq\u2014answers? Yes", "https://example.com/faq"],
    ["https://example.com/sale\u2013today?! Yes", "https://example.com/sale"],
    ["https://example.com/sale\u2013today?)", "https://example.com/sale"],
    ["https://example.com/sale\u2013shop/.", "https://example.com/sale"],
  ])("a_dash_before_digits_a_host_or_a_sentence_ends_the_link_%#", (text, link) => {
    expect(linksIn(text)).toEqual([link]);
  });

  it("a_dash_before_a_path_or_query_word_continues_the_link", () => {
    const link = "https://example.com/sale\u2013deals/2026?utm=email";
    expect(linksIn(`${link} jetzt`)).toEqual([link]);
  });

  it("a_changed_campaign_after_a_dashed_path_word_is_a_parameter_finding", () => {
    const link = "https://example.com/summer\u2013sale/shoes?utm=email";
    expect(linkRows(link, link.replace("email", "mail"), "de-DE")[0]).toEqual([
      ["utm=email", "utm=mail"],
    ]);
  });
});
