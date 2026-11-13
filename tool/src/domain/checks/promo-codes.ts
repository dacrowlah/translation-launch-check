import { listCheck } from "./compare";

export const PROMO_CODES_DETAIL = "A promo code differs from the master.";

export const checkPromoCodes = listCheck(
  { check: "promo_codes", detail: PROMO_CODES_DETAIL },
  (p) => [p.master.promoCodes, p.target.promoCodes],
);
