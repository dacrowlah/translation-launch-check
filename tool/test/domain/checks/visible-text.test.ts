import { describe, expect, it } from "vitest";
import { protectedSpans } from "../../../src/domain/checks/spans";
import { visibleIn } from "../../support/builders";
import { testRules } from "../../support/rules";

const TD = '<td align="center" style="color:#333">Our favorite colors</td>';

describe("visible text", () => {
  it("drops_tags_with_their_attributes", () => {
    expect(visibleIn(TD)).toBe("Our favorite colors");
  });

  it.each([
    ["<td>20</td><td>30</td> Sie<br>du", "20 30 Sie du"],
    ["Save $20<br>50% off", "Save $20 50% off"],
    ["<p>Hallo</p><p>du</p>", "Hallo du"],
  ])("puts_one_space_where_a_tag_was_%#", (text, expected) => {
    expect(visibleIn(text)).toBe(expected);
  });

  it("decodes_character_references", () => {
    expect(visibleIn("Code&nbsp;: &amp; &#233;t&#xE9;")).toBe("Code\u00a0: & \u00e9t\u00e9");
  });

  it("drops_a_promo_code", () => {
    expect(visibleIn("Code: BF26 heute")).toBe("Code: heute");
  });

  it("keeps_an_unknown_or_prototype_name", () => {
    expect(visibleIn("a&foo;b&constructor;c&toString;d")).toBe("a&foo;b&constructor;c&toString;d");
  });

  it("drops_an_impossible_number", () => {
    expect(visibleIn("a&#9999999;b")).toBe("ab");
  });

  it("drops_style_and_script_bodies", () => {
    expect(visibleIn("<style>.a{color:red}</style>Hi<script>x()</script> there")).toBe("Hi there");
  });

  it.each([
    ["Gifts <$50 | Shop now >", "Gifts <$50 | Shop now >"],
    ["Prices from 5 < 10 > 3", "Prices from 5 < 10 > 3"],
  ])("keeps_angle_brackets_that_start_no_tag_%#", (text, expected) => {
    expect(visibleIn(text)).toBe(expected);
  });

  it("keeps_japanese_copy_around_an_email", () => {
    const text = "\u8a73\u7d30\u306finfo@example.jp\u307e\u3067";
    expect(visibleIn(text)).toBe("\u8a73\u7d30\u306f \u307e\u3067");
  });

  it.each([
    ["<i>".repeat(20000), ""],
    [`${"a".repeat(20000)}@`, `${"a".repeat(20000)}@`],
    ["1.".repeat(10000), "1.".repeat(10000)],
  ])("reads_a_long_cell_of_one_repeated_form_%#", (text, expected) => {
    expect(visibleIn(text)).toBe(expected);
  });
});

describe("protected spans", () => {
  it("lists_every_protected_span_in_order", () => {
    const spans = ["<b>", "a@b.de", "</b>", "www.x.com", "{{n}}", "BF26", "TrailPro", "&amp;"];
    const text = `${spans.join(" ")} shop.example.com/x`;
    expect(protectedSpans(text, testRules())).toEqual([...spans, "shop.example.com/x"]);
  });

  it("ends_an_email_at_its_domain", () => {
    expect(protectedSpans("Kontakt:service@shop.de.Danke", testRules())).toEqual([
      "service@shop.de",
    ]);
  });
});
