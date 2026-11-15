import { describe, expect, it } from "vitest";
import { letterCount, stripForLanguage } from "../../src/domain/checks/language-text.js";
import { EldLanguageDetector } from "../../src/infrastructure/eld-detector.js";
import { latinCases, paragraph } from "../support/language-cases.js";
import { describeLanguageDetectorContract } from "../support/language-detector.contract.js";
import { testRules } from "../support/rules.js";

const CANDIDATES = ["en", "de", "fr"];

const longCases = (): { lang: string; text: string }[] =>
  latinCases()
    .map((c) => ({ lang: c.lang, text: stripForLanguage(c.text, testRules()) }))
    .filter((c) => letterCount(c.text) >= 20);

const answers = (): (string | null)[] => {
  const detector = new EldLanguageDetector();
  return longCases().map((c) => detector.detect(c.text, CANDIDATES));
};

describeLanguageDetectorContract(() => new EldLanguageDetector());

describe("eld detector", () => {
  it("eld_has_no_wrong_answers_on_20_plus_letters", () => {
    const cases = longCases();
    const wrong = answers().filter((a, i) => a !== null && a !== cases[i]?.lang);
    expect(cases.length).toBeGreaterThanOrEqual(60);
    expect(wrong).toEqual([]);
  });
  it("eld_answers_most_20_plus_letter_lines", () => {
    const sure = answers().filter((a) => a !== null).length;
    expect(sure / longCases().length).toBeGreaterThan(0.8);
  });
  it("eld_catches_planted_columns", () => {
    const detector = new EldLanguageDetector();
    expect(detector.detect(paragraph("fr"), CANDIDATES)).toBe("fr");
    expect(detector.detect(paragraph("en"), CANDIDATES)).toBe("en");
  });
  it("different_candidate_sets_do_not_interfere", () => {
    const detector = new EldLanguageDetector();
    detector.detect(paragraph("de"), ["de", "en"]);
    expect(detector.detect(paragraph("fr"), CANDIDATES)).toBe("fr");
  });
  it("an_unreliable_guess_is_unsure", () => {
    expect(new EldLanguageDetector().detect("Shop now", CANDIDATES)).toBeNull();
  });
  it("never_answers_outside_the_candidates", () => {
    const dutch = "Gratis verzending vanaf vijftig euro op alle bestellingen";
    expect([...CANDIDATES, null]).toContain(new EldLanguageDetector().detect(dutch, CANDIDATES));
  });
});
