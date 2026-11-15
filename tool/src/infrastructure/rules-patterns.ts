import { PLACE } from "../domain/tokens/date-forms.js";

export const compiles = (source: string): boolean => {
  try {
    return new RegExp(source, "u") instanceof RegExp;
  } catch {
    return false;
  }
};

/**
 * A date template is a valid pattern once its {places} are filled. Whether each place exists
 * for its kind is checked when every locale's patterns are compiled (parseRules).
 */
export const isTemplate = (source: string): boolean => compiles(source.replace(PLACE, "(?:x)"));
