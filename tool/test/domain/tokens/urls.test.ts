import { describe, expect, it } from "vitest";
import { extractUrls } from "../../../src/domain/tokens/urls";
import { urlRows } from "../../support/rows";

const BF = "https://example.com/bf?utm_source=email&utm_campaign=bf26";

describe("extractUrls", () => {
  it.each([
    [
      "Details: https://example.com/de/agb?utm_campaign=bf26.",
      "https://example.com/de/agb?utm_campaign=bf26",
    ],
    ["(https://example.com/x)", "https://example.com/x"],
    ["\u00ab https://example.com/x \u00bb", "https://example.com/x"],
    ["Go https://example.com/x!", "https://example.com/x"],
  ])("strips_trailing_punctuation_from_urls_%#", (text, raw) => {
    expect(extractUrls(text).urls[0]?.raw).toBe(raw);
  });

  it("parses_host_path_and_query", () => {
    const text = "https://Example.com/bf?utm_source=email&utm_campaign=bf26";
    expect(extractUrls(text).urls[0]).toEqual({
      raw: text,
      host: "example.com",
      path: "/bf",
      query: [
        ["utm_source", "email"],
        ["utm_campaign", "bf26"],
      ],
    });
  });

  it("keeps_every_value_of_a_repeated_query_key", () => {
    expect(extractUrls("https://a.com/?x=1&x=2").urls[0]?.query).toEqual([
      ["x", "1"],
      ["x", "2"],
    ]);
  });

  it("replaces_each_url_with_one_space_and_keeps_the_punctuation", () => {
    expect(extractUrls("See https://a.com/x. Or https://b.com/y!").rest).toBe("See  . Or  !");
  });

  it("skips_an_unparseable_url_and_leaves_it_in_rest", () => {
    const result = extractUrls("Bad http://[oops here");
    expect(result).toEqual({ urls: [], rest: "Bad http://[oops here" });
  });

  it("keeps_a_merge_tag_at_the_end_of_a_url", () => {
    const url = extractUrls("Use https://shop.com/?c={{code}} now").urls[0];
    expect([url?.raw, url?.query]).toEqual(["https://shop.com/?c={{code}}", [["c", "{{code}}"]]]);
  });

  it.each([
    ["See (https://e.com/Foo_(bar))", "https://e.com/Foo_(bar)"],
    ["see (https://a.com/x_(y))", "https://a.com/x_(y)"],
    ["https://e.com/x\u201d", "https://e.com/x"],
    ["https://e.com/x\u3002", "https://e.com/x"],
    ["\u00abhttps://e.com/x\u00bb", "https://e.com/x"],
    ["https://e.com/x\u203a", "https://e.com/x"],
    ["\uff08https://e.com/x\uff09", "https://e.com/x"],
  ])("strips_closers_by_bracket_balance_%#", (text, raw) => {
    expect(extractUrls(text).urls[0]?.raw).toBe(raw);
  });

  it("strips_twenty_thousand_closers_in_one_pass", () => {
    const found = extractUrls(`https://a.b/${")".repeat(20000)}`).urls;
    expect(found.map((u) => u.raw)).toEqual(["https://a.b/"]);
  });
});

describe("where a link ends", () => {
  it.each([
    "\u8a73\u3057\u304f\u306fhttps://example.com/bf?utm_source=email\u3078",
    "https://example.com/bf?utm_source=email\u3001\u3092\u3054\u89a7\u304f\u3060\u3055\u3044\u3002",
    "\u300chttps://example.com/bf?utm_source=email\u300d\u3092\u3054\u89a7\u304f\u3060\u3055\u3044",
    "\u201ehttps://example.com/bf?utm_source=email\u201c noch heute",
  ])("ends_at_punctuation_outside_ascii_or_at_text_after_the_query_%#", (text) => {
    expect(extractUrls(text).urls[0]?.query).toEqual([["utm_source", "email"]]);
  });

  it("keeps_latin_letters_outside_ascii_in_the_path", () => {
    const found = extractUrls("https://shop.example.com/de/k\u00fcche?utm_source=email").urls;
    expect(found.map((u) => [u.path, u.query])).toEqual([
      ["/de/k%C3%BCche", [["utm_source", "email"]]],
    ]);
  });

  it("keeps_an_apostrophe_inside_a_word_of_the_path", () => {
    expect(extractUrls("See https://x.com/men's-colors now").urls[0]?.raw).toBe(
      "https://x.com/men's-colors",
    );
  });

  it("reads_an_upper_case_scheme", () => {
    const found = extractUrls("HTTPS://example.com/bf?utm_source=email").urls;
    expect(found.map((u) => u.host)).toEqual(["example.com"]);
  });

  it("reads_a_www_link_without_a_scheme_and_keeps_it_as_written", () => {
    const found = extractUrls("Shop at www.example.com/bf now").urls;
    expect(found.map((u) => [u.raw, u.host, u.path])).toEqual([
      ["www.example.com/bf", "www.example.com", "/bf"],
    ]);
  });
});

describe("links in a pair", () => {
  it.each([
    [`<a href="${BF}">Shop now</a>`, `<a href="${BF}">Jetzt kaufen</a>`],
    [`<a href='${BF}'>Shop now</a>`, `<a href='${BF}'>Jetzt kaufen</a>`],
    ['<a href="https://example.com/bf">Shop</a>', '<a href="https://example.com/bf">Kaufen</a>'],
  ])("a_quoted_href_ends_at_its_quote_%#", (master, target) => {
    expect(urlRows(master, target)).toEqual([[], []]);
  });

  it("a_changed_href_query_is_still_a_finding", () => {
    const target = `<a href="${BF.replace("email", "sms")}">Jetzt kaufen</a>`;
    expect(urlRows(`<a href="${BF}">Shop now</a>`, target)[0]).toEqual([
      ["utm_source=email", "utm_source=sms"],
    ]);
  });

  it("a_localized_path_with_an_umlaut_is_only_a_path_change", () => {
    const base = "https://shop.example.com/de/";
    const found = urlRows(`${base}kitchen?utm_source=email`, `${base}k\u00fcche?utm_source=email`);
    expect(found).toEqual([[], [["/de/kitchen", "/de/k%C3%BCche"]]]);
  });

  it("a_www_link_that_lost_its_parameter_is_a_finding", () => {
    const found = urlRows("www.example.com/bf?utm_source=email", "www.example.com/bf");
    expect(found[0]).toEqual([["utm_source=email", null]]);
  });

  it.each([
    ["https://a.com/?x=1&x=2", "https://a.com/?x=2", [["x=1", null]]],
    ["https://a.com/?constructor=a", "https://a.com/", [["constructor=a", null]]],
    ["https://a.com/", "https://a.com/?toString=x", [[null, "toString=x"]]],
    ["https://a.com/?a=1&b=2", "https://a.com/?b=2&a=1", []],
  ])("compares_the_query_as_a_multiset_of_its_own_keys_%#", (master, target, expected) => {
    expect(urlRows(master, target)[0]).toEqual(expected);
  });
});
