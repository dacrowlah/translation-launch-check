import { describe, expect, it } from "vitest";
import { inLocale, linksIn, respelled, timesIn } from "./builders";
import { extractMoney } from "../../src/domain/tokens/money";

describe("linksIn", () => {
  it("lists_each_link_of_a_text_as_written", () => {
    expect(linksIn("See https://a.com/x. Or www.b.de/y!")).toEqual([
      "https://a.com/x",
      "www.b.de/y",
    ]);
  });
});

describe("timesIn", () => {
  it("reads_a_text_as_the_tokenizer_reads_it", () => {
    const range = "\uff11\uff11\u6642\uff5e\u5348\u524d12\u6642";
    expect([timesIn("ja-JP", range), timesIn("fr-FR", "20&nbsp;h&nbsp;30")]).toEqual([
      ["11:00", "12:00"],
      ["20:30"],
    ]);
  });

  it("lists_a_two_way_twelve_by_its_default_reading", () => {
    expect(timesIn("ja-JP", "\u5348\u5f8c12\u6642")).toEqual(["00:00"]);
  });
});

describe("respelled", () => {
  it("rewrites_only_the_listed_words_of_the_visible_copy", () => {
    expect(respelled("Our colors, gray, at https://x.com/colors")).toBe(
      "Our colours, gray, at https://x.com/colors",
    );
  });
});

describe("inLocale", () => {
  it("runs_an_extractor_in_a_locale_of_the_real_rules", () => {
    expect(inLocale(extractMoney)("de-CH", "Fr. 9.50").money).toEqual([
      { amount: "9.5", currency: "CHF" },
    ]);
  });
});
