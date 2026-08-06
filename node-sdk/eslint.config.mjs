import tsParser from "@typescript-eslint/parser";
import skiesNode from "eslint-plugin-skies-node";

const selfHarnessRules = {
  "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
  "no-debugger": "error",
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-warning-comments": ["error", { terms: ["todo", "fixme", "hack", "xxx"], location: "anywhere" }],
};

export default [
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  {
    files: ["packages/**/*.ts", "examples/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: selfHarnessRules,
  },
  {
    files: ["packages/**/*.js", "tools/**/*.mjs"],
    rules: selfHarnessRules,
  },
  {
    ...skiesNode.configs["flat/recommended"],
    files: ["examples/**/*.ts"],
  },
];
