import { describe, expect, it } from "vitest";
import { dateRows, numberRows, rows, urlRows, valueRows } from "./rows.js";

const finding = (expected: string | null, found: string | null) => ({
  check: "numbers" as const,
  severity: "blocker" as const,
  detail: "d",
  expected,
  found,
});

describe("rows", () => {
  it("lists_expected_and_found_of_each_finding_in_order", () => {
    const result = { applicable: true, findings: [finding("1", null), finding(null, "2")] };
    expect(rows(result)).toEqual([
      ["1", null],
      [null, "2"],
    ]);
  });

  it("reads_a_missing_result_as_no_rows", () => {
    expect(rows(undefined)).toEqual([]);
  });

  it("reads_the_numbers_rows_of_a_pair", () => {
    expect([numberRows("Save 20%", "Sparen Sie 30%"), numberRows("Save 20%", "20 %")]).toEqual([
      [["20%", "30%"]],
      [],
    ]);
  });

  it("reads_the_dates_numbers_and_weekday_rows_of_a_pair", () => {
    expect(dateRows("Sunday, Nov 29", "Samstag, 30. November")).toEqual([
      [["11/29 Sun", "11/30 Sat"]],
      [],
      [["11/30 Mon", "11/30 Sat"]],
    ]);
  });

  it("reads_the_parameter_and_path_rows_of_a_pair", () => {
    const master = "https://a.com/x?utm=1";
    expect(urlRows(master, "https://a.com/y?utm=2")).toEqual([
      [["utm=1", "utm=2"]],
      [["/x", "/y"]],
    ]);
  });

  it("reads_the_numbers_amount_and_currency_rows_of_a_pair", () => {
    expect(valueRows("Only $50 or 2 items", "Nur 60 \u20ac oder 3 Artikel")).toEqual([
      [["2", "3"]],
      [],
      [["USD", "EUR"]],
    ]);
  });
});
