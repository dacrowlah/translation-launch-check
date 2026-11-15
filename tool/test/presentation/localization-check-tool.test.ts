import { describe, expect, it } from "vitest";
import { localizationCheckTool } from "../../src/presentation/localization-check-tool.js";
import { aDeps } from "../support/builders.js";
import { testRules } from "../support/rules.js";
import { aTelemetry } from "../support/telemetry.js";

describe("localizationCheckTool", () => {
  it("names_the_master_locale_from_the_rules_in_its_description", () => {
    const rules = { ...testRules(), master_locale: "en-GB" };
    const tool = localizationCheckTool({ ...aDeps(), rules }, aTelemetry());
    expect(tool.description).toContain("(master en-GB plus translations)");
  });

  it("tells_the_caller_that_findings_carry_a_confidence", () => {
    const tool = localizationCheckTool(aDeps(), aTelemetry());
    expect(tool.description).toContain('a confidence ("certain", or "unsure": a question');
  });
});
