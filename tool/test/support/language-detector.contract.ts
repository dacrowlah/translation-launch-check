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

/** A paragraph the detector is sure of, asked with its language left out of the candidates. */
const staysInside = (make: MakeDetector): void => {
  const answer = make(known()).detect(paragraph("fr"), ["de", "en"]);
  expect(["de", "en", null]).toContain(answer);
};

export const describeLanguageDetectorContract = (make: MakeDetector): void => {
  describe("language detector contract", () => {
    it("empty_text_is_unsure", () => {
      expect(make(known()).detect("", CANDIDATES)).toBeNull();
    });
    it("german_and_french_paragraphs_are_recognised", () => recognises(make));
    it("a_sure_answer_outside_the_candidates_is_null_or_a_candidate", () => staysInside(make));
  });
};
