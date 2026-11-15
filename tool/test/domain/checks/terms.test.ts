import { describe, expect, it } from "vitest";
import { checkGlossary } from "../../../src/domain/checks/glossary.js";
import { aPair, ctx } from "../../support/builders.js";

describe("do-not-translate terms", () => {
  it.each(["Black\u00a0Friday Angebote", "Black-Friday Angebote", "Black \u202f Friday"])(
    "a_term_joined_by_any_space_or_hyphen_is_kept_%#",
    (target) => {
      const r = checkGlossary(aPair("Black Friday deals", target), ctx());
      expect(r.glossary_dnt).toEqual({ applicable: true, findings: [] });
    },
  );

  it("a_term_with_its_words_run_together_is_missing", () => {
    const r = checkGlossary(aPair("Black Friday deals", "BlackFriday Angebote"), ctx());
    expect(r.glossary_dnt?.findings).toMatchObject([{ expected: "Black Friday", found: null }]);
  });
});
