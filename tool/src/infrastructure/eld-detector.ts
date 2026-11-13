import { eld } from "eld/small";
import type { LanguageDetector } from "../domain/ports/language-detector";

type Eld = ReturnType<typeof eld.newInstance>;

/** Offline statistical detection (eld, small dataset), restricted to the candidates. */
export class EldLanguageDetector implements LanguageDetector {
  private readonly instances = new Map<string, Eld>();

  detect(text: string, candidates: readonly string[]): string | null {
    if (text.trim() === "") return null;
    const result = this.instanceFor(candidates).detect(text);
    const sure = result.isReliable() && candidates.includes(result.language);
    return sure ? result.language : null;
  }

  private instanceFor(candidates: readonly string[]): Eld {
    const key = [...candidates].sort().join(",");
    const instance = this.instances.get(key) ?? this.create(candidates);
    this.instances.set(key, instance);
    return instance;
  }

  private create(candidates: readonly string[]): Eld {
    const instance = eld.newInstance();
    instance.setLanguageSubset([...candidates]);
    return instance;
  }
}
