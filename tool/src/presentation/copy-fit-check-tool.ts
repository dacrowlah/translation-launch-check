import { registerTool, type ToolsService } from "@optimizely-opal/opal-tools-sdk";
import { checkCopyFit } from "../application/check-copy-fit";
import type { CopyFitItem } from "../domain/copy-fit";
import type { Logger } from "../domain/ports/logger";
import type { Rules } from "../domain/rules";
import { copyFitSchema, copyFitShape } from "./schemas";
import { safeHandler } from "./safe-handler";
import { validationGate } from "./validation-gate";

const NAME = "copy_fit_check";
const DESCRIPTION =
  "Measures copy against its channel limit and finds template leftovers. Call it on every " +
  "drafted line before you present it. Counts characters, double-width ads characters and " +
  "SMS segments exactly. Returns per item: length, limit, unit, fits, over_by, encoding, " +
  "template_artifacts and severity (blocker, warning or null).";

const spec = (rules: Rules) => ({
  description: DESCRIPTION,
  inputSchema: copyFitShape(rules.limits),
});

const handler = (rules: Rules, logger: Logger) =>
  safeHandler(NAME, logger, ({ items }: { items: readonly CopyFitItem[] }) => ({
    body: checkCopyFit(items, rules),
    lines: items.length,
    locales: 0,
  }));

export const registerCopyFitCheck = (service: ToolsService, rules: Rules, logger: Logger): void => {
  validationGate(service, NAME, copyFitSchema(rules.limits));
  registerTool(NAME, spec(rules), handler(rules, logger));
};
