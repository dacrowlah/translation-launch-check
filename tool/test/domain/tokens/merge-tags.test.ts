import { describe, expect, it } from "vitest";
import { extractMergeTags } from "../../../src/domain/tokens/merge-tags";
import { testRules } from "../../support/rules";

describe("extractMergeTags", () => {
  it("finds_every_merge_tag_syntax", () => {
    expect(extractMergeTags("Hi {{first_name}} *|FNAME|* %%city%%", testRules()).tags).toEqual([
      "{{first_name}}",
      "*|FNAME|*",
      "%%city%%",
    ]);
  });

  it("replaces_each_tag_with_one_space", () => {
    expect(extractMergeTags("Hi {{a}}, bye", testRules()).rest).toBe("Hi  , bye");
  });
});
