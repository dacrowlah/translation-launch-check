import { describe, expect, it } from "vitest";
import type { LanguageDetector } from "../../src/domain/ports/language-detector";
import { paragraph } from "./language-cases";

const CANDIDATES = ["de", "fr", "en"];

/** `make` gets the paragraphs a scripted detector should recognise. */
export type MakeDetector = (known: Record<string, string>) => LanguageDetector;

const known = (): Record<string, string> => ({
  [paragraph("de")]: "de",
  [paragraph("fr")]: "fr",
});

const recognises = (make: MakeDetector): void => {
  expect(make(known()).detect(paragraph("de"), CANDIDATES)).toBe("de");
  expect(make(known()).detect(paragraph("fr"), CANDIDATES)).toBe("fr");
};

const staysInside = (make: MakeDetector): void => {
  const answer = make(known()).detect(paragraph("en"), ["de", "fr"]);
  expect(answer === null || ["de", "fr"].includes(answer)).toBe(true);
};

export const describeLanguageDetectorContract = (make: MakeDetector): void => {
  describe("language detector contract", () => {
    it("empty_text_is_unsure", () => {
      expect(make(known()).detect("", CANDIDATES)).toBeNull();
    });
    it("german_and_french_paragraphs_are_recognised", () => recognises(make));
    it("the_answer_is_null_or_a_candidate", () => staysInside(make));
  });
};
