import ts from "typescript";
import type { SliceContractFact } from "./contract-facts.js";
import type { FileFact } from "./scan.js";
import type { RuleContext, RuleResult } from "./rule-types.js";
import {
  callsIn,
  expectedSibling,
  finding,
  importsFrom,
  isDirectExpressionCall,
  isImportedCall,
  objectProperty,
  propertyName,
  stringValue,
  unwrap,
  walk,
} from "./rule-utils.js";
import type { Finding } from "./types.js";

export interface JourneyFact {
  readonly file: FileFact;
  readonly call: ts.CallExpression;
  readonly covers?: string;
  readonly path?: "happy" | "sad";
  readonly criterion?: string;
  readonly handler?: ts.ArrowFunction | ts.FunctionExpression;
  readonly shapeValid: boolean;
  readonly coLocatedSlice?: SliceContractFact;
  readonly coversCoLocatedWrite: boolean;
}

export interface JourneyEvaluation extends RuleResult {
  readonly journeys: readonly JourneyFact[];
}

const writeMethods = new Set(["delete", "patch", "post", "put"]);

function journeyPath(file: FileFact, expression: ts.Expression | undefined): "happy" | "sad" | undefined {
  if (!expression) return undefined;
  const direct = stringValue(expression);
  if (direct === "happy" || direct === "sad") return direct;
  const value = unwrap(expression);
  if (!ts.isPropertyAccessExpression(value)) return undefined;
  const result = value.name.text.toLowerCase();
  if (result !== "happy" && result !== "sad") return undefined;
  const journeyPathImports = importsFrom(file, "@skiesjs/testing", "JourneyPath");
  if (ts.isIdentifier(value.expression) && journeyPathImports.names.has(value.expression.text)) return result;
  if (ts.isPropertyAccessExpression(value.expression) && ts.isIdentifier(value.expression.expression) &&
    journeyPathImports.namespaces.has(value.expression.expression.text) && value.expression.name.text === "JourneyPath") {
    return result;
  }
  return undefined;
}

function parseJourney(
  context: RuleContext,
  contracts: readonly SliceContractFact[],
  file: FileFact,
  call: ts.CallExpression,
): JourneyFact {
  const exactSlicePath = file.relativePath.endsWith(".slice.journey.ts")
    ? expectedSibling(file.relativePath, ".slice.journey.ts", ".slice.ts")
    : undefined;
  const coLocatedSlice = contracts.find((item) => item.file.relativePath === exactSlicePath);
  const definitionArgument = call.arguments[0];
  const definition = definitionArgument && !ts.isSpreadElement(definitionArgument) &&
    ts.isObjectLiteralExpression(unwrap(definitionArgument))
    ? unwrap(definitionArgument) as ts.ObjectLiteralExpression
    : undefined;
  const coversProperty = definition ? objectProperty(definition, "covers") : undefined;
  const pathProperty = definition ? objectProperty(definition, "path") : undefined;
  const criterionProperty = definition ? objectProperty(definition, "criterion") : undefined;
  const covers = coversProperty ? stringValue(coversProperty.initializer) : undefined;
  const path = pathProperty ? journeyPath(file, pathProperty.initializer) : undefined;
  const criterion = criterionProperty ? stringValue(criterionProperty.initializer) : undefined;
  const handlerArgument = call.arguments[2];
  const handlerValue = handlerArgument && !ts.isSpreadElement(handlerArgument) ? unwrap(handlerArgument) : undefined;
  const handler = handlerValue && (ts.isArrowFunction(handlerValue) || ts.isFunctionExpression(handlerValue))
    ? handlerValue
    : undefined;
  const name = call.arguments[1];
  const directName = name && !ts.isSpreadElement(name) ? stringValue(name) : undefined;
  const shapeValid = exactSlicePath !== undefined && coLocatedSlice !== undefined &&
    isDirectExpressionCall(call) && file.source.statements.some((statement) =>
      ts.isExpressionStatement(statement) && unwrap(statement.expression) === call) &&
    definition !== undefined && covers !== undefined && path !== undefined &&
    directName !== undefined && directName.trim().length > 0 && handler !== undefined &&
    (criterionProperty === undefined || (criterion !== undefined && criterion.trim().length > 0));
  return {
    file,
    call,
    ...(covers === undefined ? {} : { covers }),
    ...(path === undefined ? {} : { path }),
    ...(criterion === undefined ? {} : { criterion }),
    ...(handler === undefined ? {} : { handler }),
    shapeValid,
    ...(coLocatedSlice === undefined ? {} : { coLocatedSlice }),
    coversCoLocatedWrite: shapeValid && coLocatedSlice?.operationId === covers && writeMethods.has(coLocatedSlice.method ?? ""),
  };
}

interface Expectation {
  readonly actual: ts.Expression;
  readonly matcher: string;
  readonly arguments: readonly ts.Expression[];
  readonly negated: boolean;
}

function expectation(file: FileFact, call: ts.CallExpression): Expectation | undefined {
  const target = unwrap(call.expression);
  if (!ts.isPropertyAccessExpression(target)) return undefined;
  const matcher = target.name.text;
  let base: ts.Expression = target.expression;
  let negated = false;
  while (ts.isPropertyAccessExpression(unwrap(base))) {
    const access = unwrap(base) as ts.PropertyAccessExpression;
    if (access.name.text === "not") negated = true;
    base = access.expression;
  }
  const candidate = unwrap(base);
  if (!ts.isCallExpression(candidate)) return undefined;
  const imported = isImportedCall(file, candidate, "vitest", "expect");
  if (!imported || candidate.arguments.length !== 1 || ts.isSpreadElement(candidate.arguments[0]!)) return undefined;
  const actual = candidate.arguments[0]!;
  const args = call.arguments.filter((argument): argument is ts.Expression => !ts.isSpreadElement(argument));
  return { actual, matcher, arguments: args, negated };
}

function expressionIdentifiers(expression: ts.Node): readonly string[] {
  const names: string[] = [];
  walk(expression, (node) => { if (ts.isIdentifier(node)) names.push(node.text); });
  return names;
}

function isResponseAssertion(value: Expectation): boolean {
  const names = expressionIdentifiers(value.actual);
  return names.some((name) => /response$/i.test(name)) || names.some((name) =>
    ["body", "headers", "status", "statusCode"].includes(name));
}

function isNegativePostCondition(value: Expectation): boolean {
  if (value.negated || isResponseAssertion(value)) return false;
  const actualNames = expressionIdentifiers(value.actual);
  const expectedNames = value.arguments.flatMap(expressionIdentifiers);
  if (["toBe", "toEqual", "toStrictEqual"].includes(value.matcher) &&
    actualNames.some((name) => /^(?:after|post)/i.test(name)) &&
    expectedNames.some((name) => /^(?:before|pre)/i.test(name))) return true;
  if (["toBeNull", "toBeUndefined"].includes(value.matcher)) return true;
  return value.matcher === "toHaveLength" && value.arguments.length === 1 &&
    ts.isNumericLiteral(unwrap(value.arguments[0]!)) && Number(value.arguments[0]!.getText()) === 0;
}

function walkDirectBody(root: ts.Node, visit: (node: ts.Node) => void): void {
  const descend = (node: ts.Node): void => {
    visit(node);
    if (node !== root && ts.isFunctionLike(node)) return;
    ts.forEachChild(node, descend);
  };
  descend(root);
}

function assertionFindings(journey: JourneyFact): readonly Finding[] {
  if (!journey.shapeValid || !journey.handler || !journey.path) return [];
  const expectations: Expectation[] = [];
  walkDirectBody(journey.handler.body, (node) => {
    if (!ts.isCallExpression(node)) return;
    const value = expectation(journey.file, node);
    if (value) expectations.push(value);
  });
  const findings: Finding[] = [];
  if (!expectations.some(isResponseAssertion)) {
    findings.push(finding(
      "SKYN0020",
      journey.file,
      `${journey.path} journey '${journey.covers ?? "(unknown)"}' must assert an observable response status/body/header with Vitest expect.`,
      journey.call.getStart(),
    ));
  }
  if (journey.path === "sad" && !expectations.some(isNegativePostCondition)) {
    findings.push(finding(
      "SKYN0020",
      journey.file,
      `sad journey '${journey.covers ?? "(unknown)"}' must also assert the write did not occur (for example expect(afterState).toEqual(beforeState)).`,
      journey.call.getStart(),
    ));
  }
  return findings;
}

export function evaluateJourneyRules(context: RuleContext, contracts: readonly SliceContractFact[]): JourneyEvaluation {
  const findings: Finding[] = [];
  const journeys: JourneyFact[] = [];
  const recognizedByFile = new Map<string, number>();
  for (const file of context.files) {
    for (const call of callsIn(file)) {
      if (!isImportedCall(file, call, "@skiesjs/testing", "journey")) continue;
      recognizedByFile.set(file.relativePath, (recognizedByFile.get(file.relativePath) ?? 0) + 1);
      const journey = parseJourney(context, contracts, file, call);
      journeys.push(journey);
      if (!journey.shapeValid) {
        findings.push(finding(
          "SKYN0033",
          file,
          "Journey evidence must be a direct static call in the exact co-located *.slice.journey.ts file with literal metadata, name, and handler.",
          call.getStart(),
        ));
        continue;
      }
      if (!journey.coversCoLocatedWrite) {
        findings.push(finding(
          "SKYN0010",
          file,
          `Journey covers '${journey.covers ?? "(unknown)"}', but it must cover the co-located write contract '${journey.coLocatedSlice?.operationId ?? "(missing)"}'.`,
          call.getStart(),
        ));
      }
      findings.push(...assertionFindings(journey));
    }
  }
  for (const file of context.files.filter((item) => item.relativePath.endsWith(".slice.journey.ts"))) {
    if ((recognizedByFile.get(file.relativePath) ?? 0) === 0) {
      findings.push(finding("SKYN0033", file, "A journey filename is not proof; declare at least one static journey imported from @skiesjs/testing.", 0));
    }
  }
  for (const contract of contracts.filter((item) => writeMethods.has(item.method ?? "") && item.operationId !== undefined)) {
    const matching = journeys.filter((journey) => journey.shapeValid && journey.coversCoLocatedWrite &&
      journey.coLocatedSlice?.file.relativePath === contract.file.relativePath);
    for (const path of ["happy", "sad"] as const) {
      const proofs = matching.filter((journey) => journey.path === path);
      if (proofs.length === 0) {
        findings.push(finding("SKYN0008", contract.file, `Write operation '${contract.operationId}' requires a co-located ${path} journey.`, contract.operationIdNode?.getStart() ?? 0));
      }
      for (const duplicate of proofs.slice(1)) {
        findings.push(finding("SKYN0033", duplicate.file, `Write operation '${contract.operationId}' has more than one ${path} journey; keep one isolated proof.`, duplicate.call.getStart()));
      }
    }
  }
  return { findings, issues: [], journeys };
}
