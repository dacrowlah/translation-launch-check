import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };

describe("package metadata", () => {
  // Duplicate named groups in the token patterns need V8 12.5+, so Node 24 exactly; Vercel
  // reads its runtime from engines.node.
  it("pins_the_node_24_runtime", () => {
    expect(pkg.engines.node).toBe("24.x");
  });

  it("is_named_for_the_translation_launch_check", () => {
    expect(pkg.name).toBe("translation-launch-check-tool");
  });
});
