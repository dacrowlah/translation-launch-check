import { describe, expect, it } from "vitest";
import { checkMergeTags } from "../../../src/domain/checks/merge-tags.js";
import { checkNumbers } from "../../../src/domain/checks/numbers.js";
import { checkPromoCodes } from "../../../src/domain/checks/promo-codes.js";
import { checkUrls } from "../../../src/domain/checks/urls.js";
import { aPair, ctx } from "../../support/builders.js";
import { rows } from "../../support/rows.js";

const ja = (master: string, target: string) => aPair(master, target, "ja-JP");

describe("structural tokens are read as sent, before NFKC", () => {
  it("full_width_braces_are_not_a_merge_tag", () => {
    const target = "\uff5b\uff5bfirst_name\uff5d\uff5d\u69d8\u3001\u3088\u3046\u3053\u305d";
    const r = checkMergeTags(ja("Hi {{first_name}}, welcome", target), ctx("ja-JP"));
    expect(rows(r)).toEqual([["{{first_name}}", null]]);
  });

  it("full_width_bars_are_not_a_mailchimp_tag", () => {
    const r = checkMergeTags(ja("*|FNAME|*", "\uff0a\uff5cFNAME\uff5c\uff0a\u69d8"), ctx("ja-JP"));
    expect(rows(r)).toEqual([["*|FNAME|*", null]]);
  });

  it("a_full_width_question_mark_loses_the_query", () => {
    const pair = ja(
      "https://example.com/bf?utm_source=email",
      "https://example.com/bf\uff1futm_source=email",
    );
    expect(rows(checkUrls(pair, ctx("ja-JP")).url_params)).toEqual([["utm_source=email", null]]);
  });

  it("a_full_width_colon_is_not_a_link", () => {
    const pair = ja("https://example.com/bf", "https\uff1a//example.com/bf");
    expect(rows(checkUrls(pair, ctx("ja-JP")).url_params)).toEqual([
      ["https://example.com/bf", null],
    ]);
  });

  it("a_full_width_promo_code_is_not_the_code", () => {
    const pair = ja("Code BF26", "\u30b3\u30fc\u30c9\uff22\uff26\uff12\uff16");
    expect(rows(checkPromoCodes(pair, ctx("ja-JP")))).toEqual([["BF26", null]]);
  });

  it("a_zone_glued_to_a_time_is_no_promo_code", () => {
    const [pair, c] = [ja("Ends 11:59 PM PT", "PT23:59\u307e\u3067"), ctx("ja-JP")];
    expect([rows(checkPromoCodes(pair, c)), rows(checkNumbers(pair, c))]).toEqual([[], []]);
  });

  it("full_width_digits_still_read_as_numbers", () => {
    const pair = ja("30% off", "\uff13\uff10\uff05\u30aa\u30d5");
    expect(checkNumbers(pair, ctx("ja-JP"))).toEqual({ applicable: true, findings: [] });
  });

  it("a_changed_full_width_number_is_a_finding", () => {
    const pair = ja("30% off", "\uff12\uff10\uff05\u30aa\u30d5");
    expect(rows(checkNumbers(pair, ctx("ja-JP")))).toEqual([["30%", "20%"]]);
  });
});
