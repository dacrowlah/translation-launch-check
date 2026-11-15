import { checkLocalization, type CheckDeps } from "../application/check-localization.js";
import type { LocalizationPackage } from "../domain/types.js";
import { safeHandler, type Telemetry } from "./safe-handler.js";
import { localizationSchema, localizationShape } from "./schemas.js";
import type { ToolDefinition } from "./tool-definition.js";

const NAME = "localization_check";
const WHAT_AND_WHEN =
  "numbers, currency, dates, merge tags, URLs, promo codes, template leftovers, length, " +
  "formality, glossary, language, typography, trademarks, markup, time zones and market " +
  "spelling. Call it once with the whole package and once more to re-check suggested fixes. " +
  'Returns status "ok" with, per locale, findings with severities and a confidence ' +
  '("certain", or "unsure": a question for a person), per-line lengths, spelling fixes and a ' +
  "status for each of the 24 checks; any other status means the call failed. It never " +
  "decides a verdict.";

const describe = (master: string): string =>
  `Runs every rule check on a localization package (master ${master} plus translations): ${WHAT_AND_WHEN}`;

const check = (deps: CheckDeps) => (pkg: LocalizationPackage) => ({
  body: checkLocalization(pkg, deps),
  lines: pkg.lines.length,
  locales: pkg.locales.length,
});

/** The use case gets the rules, clock and detector only: never the bearer token. */
export const localizationCheckTool = (deps: CheckDeps, telemetry: Telemetry): ToolDefinition => ({
  name: NAME,
  description: describe(deps.rules.master_locale),
  shape: localizationShape(deps.rules),
  handler: safeHandler(NAME, telemetry, localizationSchema(deps.rules), check(deps)),
});
