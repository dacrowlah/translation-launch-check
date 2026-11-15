import { describe, expect, it } from "vitest";
import { tokensOf } from "../../support/builders.js";

describe("do-not-translate terms in the tokenizer", () => {
  it("a_term_is_no_weekday_and_a_weekday_beside_it_still_is", () => {
    expect(tokensOf("en-US", "Black Friday ends Friday").weekdays).toEqual([4]);
  });
  it("a_term_written_with_a_no_break_space_reference_is_no_weekday", () => {
    expect(tokensOf("en-US", "Black&nbsp;Friday deals end Sunday").weekdays).toEqual([6]);
  });
  it("a_term_inside_a_link_stays_part_of_the_link", () => {
    const link = "https://x.com/black-friday?utm_source=email";
    expect(tokensOf("en-US", `Black Friday: ${link}`).urls.map((u) => u.raw)).toEqual([link]);
  });
  it("leaves_the_term_out_of_the_rest", () => {
    expect(tokensOf("de-DE", "Black Friday bei TrailPro").rest).toBe("  bei  ");
  });
});
