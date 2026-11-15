import { checkCurrency } from "../domain/checks/money.js";
import { checkDates } from "../domain/checks/dates.js";
import { checkFormality } from "../domain/checks/formality.js";
import { checkGlossary } from "../domain/checks/glossary.js";
import { checkLanguageLine } from "../domain/checks/language.js";
import { checkLength } from "../domain/checks/length.js";
import { checkLengthRatio } from "../domain/checks/length-ratio.js";
import { checkLocaleSpelling } from "../domain/checks/locale-spelling.js";
import { checkMarkup } from "../domain/checks/markup.js";
import { checkMergeTags } from "../domain/checks/merge-tags.js";
import { checkNumbers } from "../domain/checks/numbers.js";
import { checkPromoCodes } from "../domain/checks/promo-codes.js";
import { checkTemplateLeftovers } from "../domain/checks/template-leftovers.js";
import { checkTimeZone } from "../domain/checks/time-zone.js";
import { checkTrademarks } from "../domain/checks/trademarks.js";
import { checkTypography } from "../domain/checks/typography.js";
import { checkUntranslated } from "../domain/checks/untranslated.js";
import { checkUrls } from "../domain/checks/urls.js";
import type { LineCheck, LinePair, LocaleContext, MultiCheck } from "../domain/checks/compare.js";
import type { CheckId, CheckResult } from "../domain/types.js";

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
