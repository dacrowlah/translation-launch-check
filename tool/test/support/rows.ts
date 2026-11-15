import { checkDates } from "../../src/domain/checks/dates";
import { checkCurrency } from "../../src/domain/checks/money";
import { checkNumbers } from "../../src/domain/checks/numbers";
import { checkUrls } from "../../src/domain/checks/urls";
import type { CheckResult } from "../../src/domain/types";
import { aPair, ctx } from "./builders";

/** A result's findings as [expected, found] rows; no result reads as no rows. */
export const rows = (result?: CheckResult): (string | null)[][] =>
  (result?.findings ?? []).map((f) => [f.expected, f.found]);

/** The numbers rows of a master and a target line. */
export const numberRows = (master: string, target: string, locale = "de-DE") =>
  rows(checkNumbers(aPair(master, target, locale), ctx(locale)));

/** The dates, numbers and weekday_date_match rows of a master and a target line. */
export const dateRows = (master: string, target: string, locale = "de-DE") => {
  const dates = checkDates(aPair(master, target, locale), ctx(locale));
  const weekdays = rows(dates.weekday_date_match);
  return [rows(dates.dates), numberRows(master, target, locale), weekdays];
};

/** The url_params and url_path rows of a master and a target line. */
export const urlRows = (master: string, target: string, locale = "de-DE") => {
  const r = checkUrls(aPair(master, target, locale), ctx(locale));
  return [rows(r.url_params), rows(r.url_path)];
};

/** The numbers, currency_amount and currency_code rows of a master and a target line. */
export const valueRows = (master: string, target: string, locale = "de-DE") => {
  const money = checkCurrency(aPair(master, target, locale), ctx(locale));
  return [
    numberRows(master, target, locale),
    rows(money.currency_amount),
    rows(money.currency_code),
  ];
};
