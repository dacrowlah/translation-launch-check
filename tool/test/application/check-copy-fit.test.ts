import { describe, expect, it } from "vitest";
import { checkCopyFit } from "../../src/application/check-copy-fit.js";
import { testRules } from "../support/rules.js";

describe("checkCopyFit", () => {
  it("copy_fit_keeps_item_order", () => {
    const items = [
      { channel: "sms", field: "body", text: "Hi" },
      { channel: "email", field: "subject", text: "Hello" },
    ];
    const results = checkCopyFit(items, testRules());
    expect(results.map((r) => r.channel)).toEqual(["sms", "email"]);
  });
});
