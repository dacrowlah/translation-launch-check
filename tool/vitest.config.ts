import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The scaling tests time CPU work; they run alone in their own gate (vitest.perf.config.ts).
    exclude: ["test/perf/**", "**/node_modules/**"],
    passWithNoTests: false,
    pool: "forks",
    isolate: true,
  },
});
