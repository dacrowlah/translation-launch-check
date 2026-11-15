import { describe, expect, it } from "vitest";
import { linksIn } from "../../support/builders.js";
import { urlRows } from "../../support/rows.js";

const KW = "https://example.jp/s?kw=";
const OSECHI = "\u304a\u305b\u3061";
const params = (master: string, target: string, locale = "ja-JP") =>
  urlRows(master, target, locale)[0];

describe("a japanese query value may start with hiragana", () => {
  it.each([
    [`${KW}${OSECHI}`, `${KW}${OSECHI}`],
    [`${KW}${OSECHI}\u30bb\u30c3\u30c8 \u3067\u691c\u7d22`, `${KW}${OSECHI}\u30bb\u30c3\u30c8`],
  ])("reads_a_hiragana_value_to_its_end_%#", (text, link) => {
    expect(linksIn(text)).toEqual([link]);
  });

  it("an_encoded_hiragana_value_matches_the_same_value_decoded", () => {
    expect(params(`${KW}%E3%81%8A%E3%81%9B%E3%81%A1`, `${KW}${OSECHI}`)).toEqual([]);
  });

  it("a_changed_hiragana_value_is_a_parameter_finding", () => {
    expect(params(`${KW}${OSECHI}`, `${KW}${OSECHI}\u30bb\u30c3\u30c8`)).toEqual([
      [`kw=${OSECHI}`, `kw=${OSECHI}\u30bb\u30c3\u30c8`],
    ]);
  });

  it("hiragana_after_a_katakana_value_still_ends_the_link", () => {
    expect(linksIn(`${KW}\u30bb\u30fc\u30eb\u3092\u691c\u7d22`)).toEqual([
      `${KW}\u30bb\u30fc\u30eb`,
    ]);
  });
});

describe("query values are decoded as UTF-8 only", () => {
  it.each([
    ["https://example.com/?q=a+b", "https://example.com/?q=a%20b"],
    [`${KW}%95%9f%91%dc`, `${KW}%95%9F%91%DC`],
  ])("the_same_value_written_two_ways_matches_%#", (master, target) => {
    expect(params(master, target)).toEqual([]);
  });

  it.each([
    [`${KW}%95%9F%91%DC`, `${KW}%8F%AC%95%A8`, "kw=%95%9F%91%DC", "kw=%8F%AC%95%A8"],
    [
      "https://example.com/?c=%FCbersicht",
      "https://example.com/?c=%E4bersicht",
      "c=%FCbersicht",
      "c=%E4bersicht",
    ],
    [`${KW}%E3%82`, `${KW}%E3%83`, "kw=%E3%82", "kw=%E3%83"],
  ])("two_values_that_are_no_utf_8_differ_as_written_%#", (master, target, expected, found) => {
    expect(params(master, target)).toEqual([[expected, found]]);
  });
});

describe("each run of escapes is decoded on its own", () => {
  it("a_plus_and_an_encoded_space_beside_a_legacy_escape_match", () => {
    expect(params("https://example.com/?q=a+b%FF", "https://example.com/?q=a%20b%FF")).toEqual([]);
  });

  it("a_legacy_escape_opposite_the_letter_it_stands_for_is_a_finding", () => {
    expect(params("https://example.com/?q=%FCber", "https://example.com/?q=\u00fcber")).toEqual([
      ["q=%FCber", "q=\u00fcber"],
    ]);
  });
});

describe("a decoded percent sign is no escape", () => {
  it("an_encoded_percent_before_two_hex_digits_differs_from_that_escape", () => {
    expect(params("https://example.com/?q=%2541%FF", "https://example.com/?q=%41%FF")).toEqual([
      ["q=%2541%FF", "q=%41%FF"],
    ]);
  });

  it("the_same_encoded_percent_written_in_either_case_matches", () => {
    expect(params("https://example.com/?q=%2541%FF", "https://example.com/?q=%2541%ff")).toEqual(
      [],
    );
  });
});
