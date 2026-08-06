import type { ESLint, Linter, Rule } from "eslint";

/** Stable ESLint rule names exported by the Skies Node.js doctor. */
export type SkiesNodeRuleName =
  | "slice-shape"
  | "thin-map"
  | "require-slice-test"
  | "no-repository"
  | "file-size"
  | "tests-under-source"
  | "error-code-registry"
  | "explicit-slice-contract";

/** Stable public diagnostics carried in rule messages. */
export type SkiesNodeRuleId =
  | "SKYN0001"
  | "SKYN0002"
  | "SKYN0003"
  | "SKYN0006"
  | "SKYN0007"
  | "SKYN0011"
  | "SKYN0018"
  | "SKYN0022";

/** Rule-name to public-diagnostic mapping used by formatters and integrations. */
export declare const ruleIds: Readonly<Record<SkiesNodeRuleName, SkiesNodeRuleId>>;

declare const plugin: ESLint.Plugin & {
  readonly ruleIds: typeof ruleIds;
  rules: Record<SkiesNodeRuleName, Rule.RuleModule>;
  configs: {
    "flat/recommended": Linter.Config;
  };
};

export default plugin;
