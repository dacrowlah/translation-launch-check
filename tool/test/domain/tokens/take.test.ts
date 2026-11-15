import { describe, expect, it } from "vitest";
import { gapsBetween, interleaved, takeWith } from "../../../src/domain/tokens/take.js";

describe("takeWith", () => {
  it("takes_each_read_match_and_leaves_one_space", () => {
    expect(takeWith("a1b22", /\d+/gu, (m) => Number(m[0]))).toEqual({
      items: [1, 22],
      rest: "a b ",
    });
  });

  it("leaves_a_match_the_reader_refuses_in_rest", () => {
    const read = (m: RegExpMatchArray) => (m[0] === "1" ? null : m[0]);
    expect(takeWith("a1b22", /\d+/gu, read)).toEqual({ items: ["22"], rest: "a1b " });
  });

  it("reads_named_groups", () => {
    const found = takeWith("x=1 y=2", /(?<k>[a-z])=(?<v>\d)/gu, (m) => m.groups?.k ?? null);
    expect(found).toEqual({ items: ["x", "y"], rest: "   " });
  });

  it("takes_every_match_of_a_long_text", () => {
    expect(takeWith("1 ".repeat(20000), /\d/gu, (m) => m[0]).items).toHaveLength(20000);
  });
});

describe("gapsBetween", () => {
  it("cuts_the_text_into_one_more_gap_than_cuts", () => {
    const cuts = [
      { at: 1, length: 2 },
      { at: 3, length: 0 },
      { at: 5, length: 1 },
    ];
    expect(gapsBetween("abcdefg", cuts)).toEqual(["a", "", "de", "g"]);
  });

  it("is_the_whole_text_without_cuts", () => {
    expect(gapsBetween("abc", [])).toEqual(["abc"]);
  });
});

describe("interleaved", () => {
  it("puts_each_item_after_its_gap_and_ends_with_the_last_gap", () => {
    expect(interleaved(["a", "b", "c"], ["1", "2"])).toEqual(["a", "1", "b", "2", "c"]);
  });
});
