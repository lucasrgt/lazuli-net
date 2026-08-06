import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.{js,ts}", "examples/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "packages/eslint-plugin-skies-node/index.test.js"],
  },
});
