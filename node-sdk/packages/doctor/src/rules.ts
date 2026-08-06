import { evaluateBaseRules } from "./base-rules.js";
import { readSliceContract } from "./contract-facts.js";
import { evaluateContractRules } from "./contract-rules.js";
import { evaluateErrorCodeRules } from "./error-code-rules.js";
import { evaluateJourneyRules } from "./journey-rules.js";
import { evaluateProofRules } from "./proof-rules.js";
import type { RuleContext, RuleResult } from "./rule-types.js";
import type { WorkspaceFacts } from "./scan.js";

/** Evaluate independent AST/workspace joins without constructing a TypeScript Program or language service. */
export async function evaluateRules(facts: WorkspaceFacts): Promise<RuleResult> {
  const files = [...facts.files.values()];
  const context: RuleContext = {
    facts,
    files,
    slices: files.filter((file) => file.relativePath.endsWith(".slice.ts")),
    modules: files.filter((file) => file.relativePath.endsWith(".module.ts")),
  };
  const contracts = context.slices.map(readSliceContract);
  const base = await evaluateBaseRules(context);
  const contract = evaluateContractRules(context, contracts);
  const journeys = evaluateJourneyRules(context, contracts);
  const errors = evaluateErrorCodeRules(context, contracts);
  const proofs = evaluateProofRules(context, contracts, journeys.journeys);
  return {
    findings: [...base.findings, ...contract.findings, ...journeys.findings, ...errors.findings, ...proofs.findings],
    issues: [...base.issues, ...contract.issues, ...journeys.issues, ...errors.issues, ...proofs.issues],
  };
}
