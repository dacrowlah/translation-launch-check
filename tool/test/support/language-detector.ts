import type { LanguageDetector } from "../../src/domain/ports/language-detector";

/** Answers from a text -> language map; any other text is "unsure" (null). */
export class FakeLanguageDetector implements LanguageDetector {
  constructor(private readonly answers: Readonly<Record<string, string | null>>) {}

  detect(text: string): string | null {
    return this.answers[text] ?? null;
  }
}
