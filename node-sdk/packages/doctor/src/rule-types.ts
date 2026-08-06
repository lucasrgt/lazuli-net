import type { FileFact, WorkspaceFacts } from "./scan.js";
import type { Finding, InspectionIssue } from "./types.js";

export interface RuleResult {
  readonly findings: readonly Finding[];
  readonly issues: readonly InspectionIssue[];
}

export interface RuleContext {
  readonly facts: WorkspaceFacts;
  readonly files: readonly FileFact[];
  readonly slices: readonly FileFact[];
  readonly modules: readonly FileFact[];
}
