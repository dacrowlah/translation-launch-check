import { registerTool } from "@optimizely-opal/opal-tools-sdk";
import { checkLocalization, type CheckDeps } from "../application/check-localization";
import type { Logger } from "../domain/ports/logger";
import type { Limits } from "../domain/rules";
import type { LocalizationPackage } from "../domain/types";
import { localizationSchema, localizationShape } from "./schemas";
import { safeHandler } from "./safe-handler";

const NAME = "localization_check";
const DESCRIPTION =
  "Runs every rule check on a localization package (master en-US plus translations): " +
  "numbers, currency, dates, merge tags, URLs, promo codes, template leftovers, length, " +
  "formality, glossary, language, typography, trademarks, markup, time zones and market " +
  "spelling. Call it once with the whole package and once more to re-check suggested fixes. " +
  "Returns, per locale, findings with severities, per-line lengths, spelling fixes and a " +
  "status for each of the 24 checks. It never decides a verdict.";

const spec = (limits: Limits) => ({
  description: DESCRIPTION,
  inputSchema: localizationShape(limits),
});

const check = (deps: CheckDeps) => (pkg: LocalizationPackage) => ({
  body: checkLocalization(pkg, deps),
  lines: pkg.lines.length,
  locales: pkg.locales.length,
});

const handler = (deps: CheckDeps, logger: Logger) =>
  safeHandler(NAME, logger, localizationSchema(deps.rules.limits), check(deps));

export const registerLocalizationCheck = (deps: CheckDeps, logger: Logger): void => {
  registerTool(NAME, spec(deps.rules.limits), handler(deps, logger));
};
