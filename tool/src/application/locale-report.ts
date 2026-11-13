import type { LinePair, LocaleContext } from "../domain/checks/compare";
import { spellingFix } from "../domain/checks/spelling";
import { lengthInfo } from "../domain/copy-fit";
import type { CheckId, CheckResult, CheckStatus, LineReport, LocaleReport } from "../domain/types";
import type { LineResults } from "./locale-checks";

export interface Scored {
  readonly pair: LinePair;
  readonly results: LineResults;
}

const fixOf = ({ targetText, locale }: LinePair, ctx: LocaleContext): string | null => {
  const { fixed } = spellingFix(targetText, locale, ctx.rules);
  return fixed === targetText ? null : fixed;
};

const lineReport = (ids: readonly CheckId[], ctx: LocaleContext) => {
  return ({ pair, results }: Scored): LineReport => ({
    id: pair.line.id,
    length: lengthInfo(pair.line, pair.targetText, ctx.rules),
    findings: ids.flatMap((id) => results[id]?.findings ?? []),
    spelling_fix: fixOf(pair, ctx),
  });
};

const statusOf = (id: CheckId, scored: readonly Scored[], column: CheckResult): CheckStatus => {
  const ran =
    scored.some((s) => s.results[id]?.applicable) ||
    (id === "language_column" && column.applicable);
  return ran ? "verified" : "not_applicable";
};

const checksOf = (ids: readonly CheckId[], scored: readonly Scored[], column: CheckResult) =>
  Object.fromEntries(ids.map((id) => [id, statusOf(id, scored, column)]));

export const buildReport = (
  ctx: LocaleContext,
  scored: readonly Scored[],
  column: CheckResult,
  ids: readonly CheckId[],
): LocaleReport => ({
  ...{ locale: ctx.locale, status: "checked", column_findings: column.findings },
  lines: scored.map(lineReport(ids, ctx)),
  checks: checksOf(ids, scored, column),
});
