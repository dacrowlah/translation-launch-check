import { describe, expect, it } from "vitest";
import { corpusAreas, valueFindings } from "../support/corpus.js";

/**
 * Every reproduction from the review rounds, one literal row each, through the use case on
 * the real rules (rows in test/fixtures/regression/). A known_limitation_ group pins a ruled
 * cost as it is today. A failing row names its group, its row and its copy.
 */
describe.each(corpusAreas())("regression corpus: %s", (_area, behaviours) => {
  describe.each(Object.entries(behaviours))("%s", (behaviour, rows) => {
    const labelled = rows.map((row, i) => ({ label: `${behaviour}_${i}`, row }));
    it.each(labelled)("$label", ({ label, row }) => {
      const [locale, master, target, expected] = row;
      const copy = `${label} (${locale}): ${master} || ${target}`;
      expect(valueFindings(locale, master, target), copy).toEqual(expected);
    });
  });
});
