import { describe, expect, it } from "vitest";
import { checkNumbers } from "../../../src/domain/checks/numbers.js";
import { checkUrls } from "../../../src/domain/checks/urls.js";
import { decodeReferences } from "../../../src/domain/tokens/references.js";
import { extractUrls } from "../../../src/domain/tokens/urls.js";
import { aPair, ctx } from "../../support/builders.js";
import { rows } from "../../support/rows.js";

const percentRows = (target: string, locale: string) =>
  rows(checkNumbers(aPair("Save 20% today!", target, locale), ctx(locale)));

describe("decodeReferences", () => {
  it("decodes_named_decimal_and_hex_references", () => {
    expect(decodeReferences("&nbsp;&#160;&#8239;&#x202F;&amp;&euro;&lt;")).toBe(
      "\u00a0\u00a0\u202f\u202f&\u20ac<",
    );
  });

  it("reads_names_only_from_its_own_table", () => {
    expect(decodeReferences("a&constructor;b&toString;c&foo;")).toBe(
      "a&constructor;b&toString;c&foo;",
    );
  });

  it("drops_a_reference_to_nul_a_surrogate_a_noncharacter_or_no_character", () => {
    expect(decodeReferences("a&#0;b&#xD800;c&#xFFFE;d&#xFDD0;e&#9999999;f")).toBe("abcdef");
  });
});

describe("references in the copy are their characters", () => {
  it.each([
    ["\u00c9conomisez 20&nbsp;% aujourd'hui", "fr-FR"],
    ["\u00c9conomisez 20&#8239;% aujourd'hui", "fr-FR"],
    ["Sparen Sie heute 20&#x202F;%", "de-CH"],
  ])("an_encoded_space_before_a_percent_sign_is_a_space_%#", (target, locale) => {
    expect(percentRows(target, locale)).toEqual([]);
  });

  it("a_changed_percentage_after_an_encoded_space_is_a_finding", () => {
    expect(percentRows("\u00c9conomisez 25&nbsp;% aujourd'hui", "fr-FR")).toEqual([["20%", "25%"]]);
  });
});

describe("references around links", () => {
  it("reads_an_encoded_ampersand_in_a_query_as_an_ampersand", () => {
    const master = "https://e.com/bf?utm_source=email&utm_campaign=bf";
    const target = '<a href="https://e.com/bf?utm_source=email&amp;utm_campaign=bf">Los</a>';
    expect(rows(checkUrls(aPair(master, target), ctx()).url_params)).toEqual([]);
  });

  it("a_changed_parameter_after_an_encoded_ampersand_is_a_finding", () => {
    const master = "https://e.com/bf?utm_source=email&utm_campaign=bf";
    const target = "https://e.com/bf?utm_source=email&amp;utm_campaign=cm";
    expect(rows(checkUrls(aPair(master, target), ctx()).url_params)).toEqual([
      ["utm_campaign=bf", "utm_campaign=cm"],
    ]);
  });

  it.each(["https://x.com/sale&nbsp;heute", "&lt;https://x.com/sale&gt;"])(
    "ends_a_link_at_any_other_reference_%#",
    (text) => {
      expect(extractUrls(text).urls.map((u) => u.path)).toEqual(["/sale"]);
    },
  );
});
