export interface LanguageDetector {
  /** The best-matching candidate language code, or null when unsure. */
  detect(text: string, candidates: readonly string[]): string | null;
}
