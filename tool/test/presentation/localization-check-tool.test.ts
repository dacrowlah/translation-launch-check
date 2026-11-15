import { describe, expect, it } from "vitest";
import { localizationCheckTool } from "../../src/presentation/localization-check-tool";
import { aDeps } from "../support/builders";
import { testRules } from "../support/rules";
import { aTelemetry } from "../support/telemetry";

describe("localizationCheckTool", () => {
  it("names_the_master_locale_from_the_rules_in_its_description", () => {
    const rules = { ...testRules(), master_locale: "en-GB" };
    const tool = localizationCheckTool({ ...aDeps(), rules }, aTelemetry());
    expect(tool.description).toContain("(master en-GB plus translations)");
  });
});
