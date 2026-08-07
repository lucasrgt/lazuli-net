import tsParser from "@typescript-eslint/parser";
import skiesNode from "@skiesjs/eslint-plugin-node";

export default [
  { ignores: ["dist/**", "coverage/**"] },
  {
    ...skiesNode.configs["flat/recommended"],
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: {
      ...skiesNode.configs["flat/recommended"].rules,
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "no-debugger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-warning-comments": ["error", { terms: ["todo", "fixme", "hack", "xxx"], location: "anywhere" }],
    },
  },
  {
    files: ["**/*.mjs"],
    rules: {
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "no-debugger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
];
