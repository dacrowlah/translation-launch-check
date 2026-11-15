import { checkCopyFit } from "../application/check-copy-fit";
import type { CopyFitItem } from "../domain/copy-fit";
import type { Rules } from "../domain/rules";
import { safeHandler, type Telemetry } from "./safe-handler";
import { copyFitSchema, copyFitShape } from "./schemas";
import type { ToolDefinition } from "./tool-definition";

const NAME = "copy_fit_check";
const DESCRIPTION =
  "Measures copy against its channel limit and finds template leftovers. Call it on every " +
  "drafted line before you present it. Counts characters, double-width ads characters and " +
  'SMS segments exactly. Returns status "ok" and items, one per item: length, limit, unit, ' +
  "fits, over_by, encoding, template_artifacts and severity (blocker, warning or null). Any " +
  "other status means the call failed.";

const fit = (rules: Rules) => (input: { items: readonly CopyFitItem[] }) => ({
  body: { items: checkCopyFit(input.items, rules) },
  lines: input.items.length,
  locales: 0,
});

export const copyFitCheckTool = (rules: Rules, telemetry: Telemetry): ToolDefinition => ({
  name: NAME,
  description: DESCRIPTION,
  shape: copyFitShape(rules.limits),
  handler: safeHandler(NAME, telemetry, copyFitSchema(rules.limits), fit(rules)),
});
