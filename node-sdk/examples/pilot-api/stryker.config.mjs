/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  mutate: ["src/modules/wallets/wallet-id.ts:12-17"],
  testRunner: "vitest",
  vitest: { configFile: "vitest.mutation.config.ts" },
  concurrency: 2,
  incremental: true,
  incrementalFile: ".stryker-tmp/incremental.json",
  timeoutMS: 120000,
  timeoutFactor: 2,
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  coverageAnalysis: "perTest",
  reporters: ["clear-text", "json"],
  thresholds: { high: 90, low: 80, break: 80 },
  jsonReporter: { fileName: ".stryker-tmp/reports/mutation.json" },
};
