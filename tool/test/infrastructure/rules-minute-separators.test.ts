import { describe, expect, it } from "vitest";
import { parseRules } from "../../src/infrastructure/rules-schema.js";
import { rawRules, testRules } from "../support/rules.js";

const withSeparators = (separators: unknown) =>
  parseRules({ ...rawRules(), time_minute_separators: separators });
const SHIPPED = { en: [":", "."], de: [":", "."], fr: [":", "."], ja: [":", "."] };

describe("time_minute_separators in rules.json", () => {
  it("accepts_one_character_per_separator_for_each_language_with_time_formats", () => {
    const separators = { ...SHIPPED, fr: [":", ".", "h"] };
    expect(withSeparators(separators).time_minute_separators).toEqual(separators);
  });

  it.each([[{ ...SHIPPED, ja: [""] }], [{ ...SHIPPED, ja: [":."] }], [{ ...SHIPPED, ja: ":" }]])(
    "rejects_a_separator_that_is_not_one_character_%#",
    (separators) => {
      expect(() => withSeparators(separators)).toThrow(/time_minute_separators/);
    },
  );

  it("rejects_a_language_with_time_formats_but_no_separators", () => {
    const withoutJapanese = { en: SHIPPED.en, de: SHIPPED.de, fr: SHIPPED.fr };
    expect(() => withSeparators(withoutJapanese)).toThrow(/time_minute_separators: none for ja/);
  });

  it("rejects_separators_for_a_language_without_time_formats", () => {
    const separators = { ...SHIPPED, xx: [":"] };
    expect(() => withSeparators(separators)).toThrow(
      /time_minute_separators: no time_formats for xx/,
    );
  });

  it.each([
    ["en", "(?<h>\\d{1,2})-(?<m>\\d{2})", "-"],
    ["de", "(?<h>\\d{1,2})[:.,](?<m>\\d{2})", ","],
  ])(
    "rejects_a_time_format_whose_minutes_follow_an_undeclared_separator_%#",
    (lang, format, sign) => {
      const formats = { ...testRules().time_formats, [lang]: [format] };
      const rules = { ...rawRules(), time_formats: formats };
      expect(() => parseRules(rules)).toThrow(
        `time_formats: ${lang} writes "${sign}" before minutes`,
      );
    },
  );

  it("ignores_a_unit_word_between_hour_and_minutes", () => {
    const formats = { ...testRules().time_formats, fr: ["(?<h>\\d{1,2})\\s?h\\s?(?<m>\\d{2})"] };
    expect(parseRules({ ...rawRules(), time_formats: formats }).time_formats.fr).toEqual(
      formats.fr,
    );
  });
});
