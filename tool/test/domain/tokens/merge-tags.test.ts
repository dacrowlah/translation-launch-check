import { describe, expect, it } from "vitest";
import { extractMergeTags } from "../../../src/domain/tokens/merge-tags.js";
import { testRules } from "../../support/rules.js";

describe("extractMergeTags", () => {
  it("finds_every_merge_tag_syntax", () => {
    expect(extractMergeTags("Hi {{first_name}} *|FNAME|* %%city%%", testRules()).mergeTags).toEqual(
      ["{{first_name}}", "*|FNAME|*", "%%city%%"],
    );
  });

  it("replaces_each_tag_with_one_space", () => {
    expect(extractMergeTags("Hi {{a}}, bye", testRules()).rest).toBe("Hi  , bye");
  });

  it("reads_a_mailchimp_tag_only_in_capitals", () => {
    expect(extractMergeTags("*|fname|*", testRules()).mergeTags).toEqual([]);
  });

  it("finds_nothing_when_there_are_no_patterns", () => {
    const rules = { ...testRules(), merge_tag_patterns: [] };
    expect(extractMergeTags("Hi {{a}}", rules)).toEqual({ mergeTags: [], rest: "Hi {{a}}" });
  });
});
