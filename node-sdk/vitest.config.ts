import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.{test,spec,proof,avp,journey}.{js,ts}", "examples/**/*.{test,spec,proof,avp,journey}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "packages/eslint-plugin-skies-node/index.test.js"],
  },
});
