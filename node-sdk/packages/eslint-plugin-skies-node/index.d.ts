import type { ESLint, Linter, Rule } from "eslint";

declare const plugin: ESLint.Plugin & {
  rules: Record<string, Rule.RuleModule>;
  configs: {
    "flat/recommended": Linter.Config;
  };
};

export default plugin;
