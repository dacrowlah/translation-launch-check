import { checkCurrency } from "../domain/checks/money";
import { checkDates } from "../domain/checks/dates";
import { checkFormality } from "../domain/checks/formality";
import { checkGlossary } from "../domain/checks/glossary";
import { checkLanguageLine } from "../domain/checks/language";
import { checkLength } from "../domain/checks/length";
import { checkLengthRatio } from "../domain/checks/length-ratio";
import { checkLocaleSpelling } from "../domain/checks/locale-spelling";
import { checkMarkup } from "../domain/checks/markup";
import { checkMergeTags } from "../domain/checks/merge-tags";
import { checkNumbers } from "../domain/checks/numbers";
import { checkPromoCodes } from "../domain/checks/promo-codes";
import { checkTemplateLeftovers } from "../domain/checks/template-leftovers";
import { checkTimeZone } from "../domain/checks/time-zone";
import { checkTrademarks } from "../domain/checks/trademarks";
import { checkTypography } from "../domain/checks/typography";
import { checkUntranslated } from "../domain/checks/untranslated";
import { checkUrls } from "../domain/checks/urls";
import type { LineCheck, LinePair, LocaleContext, MultiCheck } from "../domain/checks/compare";
import type { CheckId, CheckResult } from "../domain/types";

export type LineResults = Partial<Record<CheckId, CheckResult>>;

const one =
  (id: CheckId, check: LineCheck): MultiCheck =>
  (pair, ctx) => ({ [id]: check(pair, ctx) });

/** Every per-line check, in the contract's table order. */
export const LINE_CHECKS: readonly MultiCheck[] = [
  one("numbers", checkNumbers),
  checkCurrency,
  checkDates,
  one("merge_tags", checkMergeTags),
  checkUrls,
  one("promo_codes", checkPromoCodes),
  one("template_leftovers", checkTemplateLeftovers),
  checkLength,
  one("formality", checkFormality),
  checkGlossary,
  one("untranslated", checkUntranslated),
  one("language_line", checkLanguageLine),
  one("typography", checkTypography),
  one("length_ratio", checkLengthRatio),
  one("trademark_symbols", checkTrademarks),
  one("markup", checkMarkup),
  one("time_zone", checkTimeZone),
  one("locale_spelling", checkLocaleSpelling),
];

export const runLineChecks = (pair: LinePair, ctx: LocaleContext): LineResults =>
  LINE_CHECKS.reduce<LineResults>((all, check) => ({ ...all, ...check(pair, ctx) }), {});
