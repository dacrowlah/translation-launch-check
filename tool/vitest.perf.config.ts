import { defineConfig } from "vitest/config";

// The scaling tests time CPU work, so they run apart from the unit suite, one file and one
// test at a time in a single child process (pnpm test:perf, its own preflight gate).
// --expose-gc lets each sample start after a full collection, so no sample pays for another.
export default defineConfig({
  test: {
    include: ["test/perf/**/*.{test,spec}.ts"],
    passWithNoTests: false,
    pool: "forks",
    isolate: true,
    fileParallelism: false,
    maxWorkers: 1,
    execArgv: ["--expose-gc"],
    testTimeout: 60_000,
  },
});
