import ts from "typescript";
import type { SliceContractFact } from "./contract-facts.js";
import type { JourneyFact } from "./journey-rules.js";
import type { FileFact } from "./scan.js";
import type { RuleContext, RuleResult } from "./rule-types.js";
import { callsIn, expectedSibling, finding, importsFrom, isDirectExpressionCall, isImportedCall, lineDirectives, unwrap } from "./rule-utils.js";
import type { Finding } from "./types.js";

interface ProofCitation {
  readonly id: string;
  readonly file: FileFact;
  readonly offset: number;
  readonly slicePath: string;
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const proofFilePattern = /\.(?:test|spec|proof|avp|journey)\.[cm]?tsx?$/;

function sliceForProofPath(relativePath: string): string | undefined {
  for (const suffix of [".slice.test.ts", ".slice.journey.ts"] as const) {
    if (relativePath.endsWith(suffix)) return expectedSibling(relativePath, suffix, ".slice.ts");
  }
  return undefined;
}

function directTestingStatement(file: FileFact, offset: number): boolean {
  const statement = file.source.statements.find((item) => item.getStart(file.source) >= offset);
  if (!statement || file.text.slice(offset, statement.getStart(file.source)).trim() !== "") return false;
  if (!ts.isExpressionStatement(statement)) return false;
  const value = unwrap(statement.expression);
  if (!ts.isCallExpression(value) || !isDirectExpressionCall(value)) return false;
  return ["unit", "integration", "e2e", "journey"].some((name) =>
    isImportedCall(file, value, "@skiesjs/testing", name));
}

function commentCitations(context: RuleContext, findings: Finding[]): readonly ProofCitation[] {
  const citations: ProofCitation[] = [];
  for (const file of context.files) {
    const slicePath = sliceForProofPath(file.relativePath);
    if (!slicePath) continue;
    for (const directive of lineDirectives(file, "proof")) {
      const id = directive.payload;
      if (!idPattern.test(id) || !directTestingStatement(file, directive.end)) {
        findings.push(finding("SKYN0030", file, "@skies-proof must carry one stable criterion ID and immediately precede a direct @skiesjs/testing proof call.", directive.offset));
        continue;
      }
      citations.push({ id, file, offset: directive.offset, slicePath });
    }
  }
  return citations;
}

function criterionRules(
  context: RuleContext,
  contracts: readonly SliceContractFact[],
  journeys: readonly JourneyFact[],
): readonly Finding[] {
  const findings: Finding[] = [];
  const comments = commentCitations(context, findings);
  for (const contract of contracts) {
    const byId = new Map<string, SliceContractFact["criteria"]>();
    for (const criterion of contract.criteria) {
      const entries = byId.get(criterion.id) ?? [];
      byId.set(criterion.id, [...entries, criterion]);
    }
    if (contract.malformedCriteriaOffset !== undefined) {
      findings.push(finding("SKYN0031", contract.file, "Contract criteria must be a nonempty direct array of stable string IDs.", contract.malformedCriteriaOffset));
    }
    if (contract.criteria.length === 0) {
      findings.push(finding("SKYN0031", contract.file, "Slice declares no criterion; add `// @skies-criterion <stable-id>` (or a future direct contract criteria array).", contract.call?.getStart() ?? 0));
    }
    for (const [id, declarations] of byId) {
      for (const duplicate of declarations.slice(1)) {
        findings.push(finding("SKYN0031", contract.file, `Criterion '${id}' is declared more than once on this slice.`, duplicate.offset));
      }
      const proofComments = comments.filter((citation) => citation.slicePath === contract.file.relativePath && citation.id === id);
      const proofJourneys = journeys.filter((journey) => journey.shapeValid && journey.coversCoLocatedWrite &&
        journey.coLocatedSlice?.file.relativePath === contract.file.relativePath && journey.criterion === id);
      const count = proofComments.length + proofJourneys.length;
      if (count === 0) {
        findings.push(finding("SKYN0030", contract.file, `Criterion '${id}' requires exactly one matching co-located proof citation.`, declarations[0]?.offset ?? 0));
      } else if (count > 1) {
        const proofs = [
          ...proofComments.map((citation) => ({ file: citation.file, offset: citation.offset })),
          ...proofJourneys.map((journey) => ({ file: journey.file, offset: journey.call.getStart() })),
        ].sort((left, right) =>
          (left.file.relativePath < right.file.relativePath ? -1 : left.file.relativePath > right.file.relativePath ? 1 : 0) ||
          left.offset - right.offset);
        for (const proof of proofs.slice(1)) {
          findings.push(finding("SKYN0030", proof.file, `Criterion '${id}' has more than one proof citation; keep exactly one.`, proof.offset));
        }
      }
    }
    const declared = new Set(contract.criteria.map((criterion) => criterion.id));
    for (const citation of comments.filter((item) => item.slicePath === contract.file.relativePath)) {
      if (!declared.has(citation.id)) findings.push(finding("SKYN0030", citation.file, `Proof cites undeclared criterion '${citation.id}'.`, citation.offset));
    }
    for (const journey of journeys.filter((item) => item.coLocatedSlice?.file.relativePath === contract.file.relativePath && item.criterion)) {
      if (!declared.has(journey.criterion!)) findings.push(finding("SKYN0030", journey.file, `Journey cites undeclared criterion '${journey.criterion!}'.`, journey.call.getStart()));
    }
  }
  return findings;
}

function rootIdentifier(expression: ts.Expression): string | undefined {
  let current = unwrap(expression);
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) current = unwrap(current.expression);
  if (ts.isCallExpression(current)) return rootIdentifier(current.expression);
  return ts.isIdentifier(current) ? current.text : undefined;
}

function skippedTestRules(context: RuleContext): readonly Finding[] {
  const findings: Finding[] = [];
  for (const file of context.files.filter((item) => proofFilePattern.test(item.relativePath))) {
    const known = new Set(["describe", "it", "suite", "test"]);
    for (const exported of ["describe", "it", "suite", "test"]) {
      for (const local of importsFrom(file, "vitest", exported).names) known.add(local);
    }
    for (const call of callsIn(file)) {
      const target = unwrap(call.expression);
      if (!ts.isPropertyAccessExpression(target)) continue;
      const method = target.name.text;
      if (!["fails", "only", "runIf", "skip", "skipIf", "todo", "todoIf"].includes(method)) continue;
      const root = rootIdentifier(target.expression);
      if (root === undefined || !known.has(root)) continue;
      findings.push(finding(
        "SKYN0032",
        file,
        `Suppressed or conditional test uses .${method}; only fully executed ordinary tests are proof.`,
        target.name.getStart(),
      ));
    }
  }
  return findings;
}

export function evaluateProofRules(
  context: RuleContext,
  contracts: readonly SliceContractFact[],
  journeys: readonly JourneyFact[],
): RuleResult {
  return { findings: [...criterionRules(context, contracts, journeys), ...skippedTestRules(context)], issues: [] };
}
