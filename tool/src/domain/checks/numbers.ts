import { listCheck } from "./compare";

export const NUMBERS_DETAIL = "A number differs from the master.";

export const checkNumbers = listCheck({ check: "numbers", detail: NUMBERS_DETAIL }, (p) => [
  p.master.numbers,
  p.target.numbers,
]);
