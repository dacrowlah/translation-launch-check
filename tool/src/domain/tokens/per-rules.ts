import type { Rules } from "../rules";

/** Stores the value under the key and returns it. */
export const stored = <K extends object, T>(cache: WeakMap<K, T>, key: K, value: T): T => {
  cache.set(key, value);
  return value;
};

/** Builds a value once per Rules object (patterns derived from the rules, for instance). */
export const perRules = <T extends object>(build: (rules: Rules) => T): ((rules: Rules) => T) => {
  const cache = new WeakMap<Rules, T>();
  return (rules) => cache.get(rules) ?? stored(cache, rules, build(rules));
};
