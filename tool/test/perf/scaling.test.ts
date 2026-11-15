import { describe, expect, it } from "vitest";
import { growth, LINEAR_GROWTH, SCALING_TIMEOUT } from "../support/scaling";

/** n rounds of cheap work, or n * n rounds; the result is kept so the loop is not skipped. */
let sink = 0;
const linear = (n: number) => {
  for (let i = 0; i < n * 2000; i++) sink += i % 7;
};
const quadratic = (n: number) => {
  for (let i = 0; i < n * n; i++) sink += i % 7;
};

describe("growth", () => {
  it("runs_the_work_it_measures", () => {
    linear(1);
    expect(sink).toBeGreaterThan(0);
  });

  it(
    "is_near_four_for_linear_work",
    () => {
      expect(growth(linear, 2000)).toBeLessThan(LINEAR_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  it(
    "is_near_sixteen_for_quadratic_work",
    () => {
      expect(growth(quadratic, 2000)).toBeGreaterThan(LINEAR_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
