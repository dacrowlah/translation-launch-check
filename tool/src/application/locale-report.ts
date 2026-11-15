import type { LinePair, LocaleContext } from "../domain/checks/compare.js";
import { lengthInfo } from "../domain/copy-fit.js";
import type {
  CheckId,
  CheckResult,
  CheckStatus,
  LineReport,
  LocaleReport,
} from "../domain/types.js";
import type { LineResults } from "./locale-checks.js";

export interface Scored {
  readonly pair: LinePair;
  readonly results: LineResults;
}

const lineReport = (ids: readonly CheckId[], ctx: LocaleContext) => {
  return ({ pair, results }: Scored): LineReport => ({
    id: pair.line.id,
    length: lengthInfo(pair.line.channel, pair.line.field, pair.targetText, ctx.rules),
    findings: ids.flatMap((id) => results[id]?.findings ?? []),
    spelling_fix: results.locale_spelling?.fix ?? null,
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

const checked = (ctx: LocaleContext, column: CheckResult) => ({
  locale: ctx.locale,
  status: "checked" as const,
  column_findings: column.findings,
});

export const buildReport = (
  ctx: LocaleContext,
  scored: readonly Scored[],
  column: CheckResult,
  ids: readonly CheckId[],
): LocaleReport => ({
  ...checked(ctx, column),
  lines: scored.map(lineReport(ids, ctx)),
  checks: checksOf(ids, scored, column),
});
