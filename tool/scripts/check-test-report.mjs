import { readFileSync } from "node:fs";

const REPORT = ".vitest.json";

function counts(report) {
  const { numTotalTests, numPassedTests, numFailedTests } = report;
  const skipped = numTotalTests - numPassedTests - numFailedTests;
  return { total: numTotalTests, passed: numPassedTests, failed: numFailedTests, skipped };
}

function problem({ total, failed, skipped }) {
  if (total === 0) return "no tests ran";
  if (failed > 0) return `${failed} failed`;
  return skipped > 0 ? `${skipped} skipped or todo` : null;
}

const result = counts(JSON.parse(readFileSync(REPORT, "utf8")));
const reason = problem(result);
console.log(`tests: ${result.passed} passed of ${result.total}, ${result.skipped} skipped`);
if (reason) {
  console.error(`test gate failed: ${reason}`);
  process.exit(1);
}
