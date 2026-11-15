import { describe, expect, it } from "vitest";
import { corpusAreas, corpusGroupsOf, rowKeys, valueFindings } from "./corpus.js";

describe("valueFindings", () => {
  it("lists_a_value_finding_as_check_expected_and_found", () => {
    expect(valueFindings("de-DE", "Save 20% today", "Sparen Sie heute 25 %")).toEqual([
      ["numbers", "20%", "25%"],
    ]);
  });

  it("leaves_out_the_checks_outside_the_corpus", () => {
    expect(valueFindings("fr-FR", "Shop now!", "Achetez maintenant!")).toEqual([]);
  });

  it("adds_the_spelling_fix_of_the_line_as_a_row", () => {
    expect(valueFindings("en-GB", "Our colors", "Our colors")).toEqual([
      ["spelling_fix", null, "Our colours"],
    ]);
  });

  it.each(["de-de", "xx-XX", "en-US"])("refuses_a_locale_that_checks_nothing_%#", (locale) => {
    expect(() => valueFindings(locale, "Save 20%", "Spare 25 %")).toThrow(/not a target locale/);
  });
});

describe("corpusGroupsOf", () => {
  it("reads_the_groups_of_a_file", () => {
    const text = '{\n  "a_has_no_finding": [["de-DE", "x", "y", []]]\n}';
    expect(corpusGroupsOf(text)).toEqual({ a_has_no_finding: [["de-DE", "x", "y", []]] });
  });

  const ROW = '["de-DE", "x", "y", []]';
  it.each([
    '{\n  "a": []\n}',
    `{\n  "a": [${ROW}],\n  "a": [["de-DE", "z", "w", []]]\n}`,
    `{\n  "a": [${ROW}],\n  "b": [["de-DE", "x", "y", [["numbers", "1", "2"]]]]\n}`,
  ])("refuses_an_empty_group_a_group_or_a_row_written_twice_%#", (text) => {
    expect(() => corpusGroupsOf(text)).toThrow(/broken corpus file/);
  });
});

/** A row whose expectation contradicts its group's name; a known limitation pins what it pins. */
const misfiled = (name: string, expected: readonly unknown[]): boolean => {
  if (name.startsWith("known_limitation_")) return false;
  if (name.endsWith("_has_no_finding")) return expected.length > 0;
  return name.endsWith("_finding") && expected.length === 0;
};

describe("corpusAreas", () => {
  const groups = () => corpusAreas().flatMap(([, behaviours]) => Object.entries(behaviours));

  it("holds_every_row_once_across_the_areas", () => {
    const copies = corpusAreas().flatMap(([, behaviours]) => rowKeys(behaviours));
    expect(copies.length - new Set(copies).size).toBe(0);
  });

  it("reads_every_area_with_four_values_per_row", () => {
    const rows = groups().flatMap(([, list]) => list);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.length !== 4)).toEqual([]);
  });

  it("expects_no_finding_in_a_no_finding_group_and_one_in_a_finding_group", () => {
    const wrong = groups().flatMap(([name, list]) =>
      list.filter((row) => misfiled(name, row[3])).map(([, master]) => `${name}: ${master}`),
    );
    expect(wrong).toEqual([]);
  });

  it.each([
    ["a_has_no_finding", [["numbers", "1", "2"]]],
    ["a_changed_number_is_a_finding", []],
  ])("calls_a_row_misfiled_when_it_contradicts_its_group_%#", (name, expected) => {
    expect(misfiled(name, expected)).toBe(true);
  });
});
