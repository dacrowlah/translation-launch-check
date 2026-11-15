import { describe, expect, it } from "vitest";
import { checkLanguageColumn } from "../../src/domain/checks/language.js";
import { EldLanguageDetector } from "../../src/infrastructure/eld-detector.js";
import { ctx } from "../support/builders.js";
import { paragraph } from "../support/language-cases.js";

/** The column check with the real detector: short columns are where eld goes wrong. */
const column = (locale: string, texts: string[]) =>
  checkLanguageColumn(texts, ctx(locale, new EldLanguageDetector())).findings.map((f) => [
    f.severity,
    f.confidence,
    f.detail,
  ]);

describe("language column with the real detector", () => {
  it("a_short_correct_german_column_is_an_unsure_warning_not_a_blocker", () => {
    expect(column("de-DE", ["Gratis Retoure"])).toEqual([
      ["warning", "unsure", "The de-DE column is short and reads as French. Is it German?"],
    ]);
  });
  it("columns_of_accepted_loanwords_and_short_words_are_no_blocker", () => {
    expect([
      column("de-DE", ["Online-Shop Sale"]),
      column("fr-FR", ["Bons plans shopping"]),
    ]).toEqual([[], []]);
  });
  it("a_long_french_column_in_german_is_still_a_blocker", () => {
    expect(column("de-DE", [paragraph("fr")])).toEqual([
      ["blocker", "certain", "The de-DE column reads as French."],
    ]);
  });
  it("a_one_word_master_column_is_an_unsure_warning", () => {
    expect(column("en-US", ["Sale"])).toEqual([
      ["warning", "unsure", "Couldn't confirm the en-US column's language. Is it English?"],
    ]);
  });
});
