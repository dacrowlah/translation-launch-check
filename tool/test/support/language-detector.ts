import type { LanguageDetector } from "../../src/domain/ports/language-detector.js";

/**
 * Answers from a text -> language map; any other text is "unsure" (null), and so is a
 * scripted answer outside the candidates, as the port promises.
 */
export class FakeLanguageDetector implements LanguageDetector {
  constructor(private readonly answers: Readonly<Record<string, string | null>>) {}

  detect(text: string, candidates: readonly string[]): string | null {
    const answer = this.answers[text] ?? null;
    return answer !== null && candidates.includes(answer) ? answer : null;
  }
}

/** Answers the first candidate and counts calls; set `throws` to make every call a defect. */
export class SwitchableDetector implements LanguageDetector {
  throws = false;
  calls = 0;

  detect(_text: string, candidates: readonly string[]): string | null {
    this.calls += 1;
    if (this.throws) throw new Error("secret detail");
    return candidates[0] ?? null;
  }
}
