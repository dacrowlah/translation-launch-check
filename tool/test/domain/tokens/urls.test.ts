import { describe, expect, it } from "vitest";
import { extractUrls } from "../../../src/domain/tokens/urls";

describe("extractUrls", () => {
  it.each([
    [
      "Details: https://example.com/de/agb?utm_campaign=bf26.",
      "https://example.com/de/agb?utm_campaign=bf26",
    ],
    ["(https://example.com/x)", "https://example.com/x"],
    ["« https://example.com/x »", "https://example.com/x"],
    ["Go https://example.com/x!", "https://example.com/x"],
  ])("strips_trailing_punctuation_from_urls %s", (text, raw) => {
    expect(extractUrls(text).urls[0]?.raw).toBe(raw);
  });

  it("parses_host_path_and_query", () => {
    const text = "https://Example.com/bf?utm_source=email&utm_campaign=bf26";
    expect(extractUrls(text).urls[0]).toEqual({
      raw: text,
      host: "example.com",
      path: "/bf",
      query: { utm_source: "email", utm_campaign: "bf26" },
    });
  });

  it("keeps_the_last_value_of_a_duplicate_query_key", () => {
    expect(extractUrls("https://a.com/?x=1&x=2").urls[0]?.query).toEqual({ x: "2" });
  });

  it("replaces_each_url_with_one_space_and_keeps_the_punctuation", () => {
    expect(extractUrls("See https://a.com/x. Or https://b.com/y!").rest).toBe("See  . Or  !");
  });

  it("skips_an_unparseable_url_and_leaves_it_in_rest", () => {
    const result = extractUrls("Bad http://[oops here");
    expect(result).toEqual({ urls: [], rest: "Bad http://[oops here" });
  });
});
