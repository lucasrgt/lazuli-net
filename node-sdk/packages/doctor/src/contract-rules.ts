import ts from "typescript";
import { directObjectPropertyFunction, readSliceContract, type SliceContractFact } from "./contract-facts.js";
import type { FileFact } from "./scan.js";
import type { RuleContext, RuleResult } from "./rule-types.js";
import { callsIn, finding, importsFrom, isImportedCall, objectProperty, propertyName, unwrap, walk } from "./rule-utils.js";
import type { Finding } from "./types.js";

const operationIdPattern = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/;

function operationIdRules(contracts: readonly SliceContractFact[]): readonly Finding[] {
  const findings: Finding[] = [];
  const operations = new Map<string, SliceContractFact[]>();
  for (const contract of contracts) {
    const at = contract.call?.getStart() ?? 0;
    if (contract.callCount !== 1 || !contract.canonical || !contract.object) {
      findings.push(finding(
        "SKYN0012",
        contract.file,
        "Slice must export exactly one `const contract = defineContract({ ... })` using a direct object literal.",
        at,
      ));
      continue;
    }
    const operationId = contract.operationId;
    if (operationId === undefined || !operationIdPattern.test(operationId)) {
      findings.push(finding(
        "SKYN0012",
        contract.file,
        "The exported contract requires a direct, nonblank stable operationId (letters/digits with `.`, `_`, or `-` separators).",
        contract.operationIdNode?.getStart() ?? contract.object.getStart(),
      ));
      continue;
    }
    const entries = operations.get(operationId) ?? [];
    entries.push(contract);
    operations.set(operationId, entries);
  }
  for (const [operationId, entries] of operations) {
    if (entries.length < 2) continue;
    for (const contract of entries) {
      findings.push(finding("SKYN0012", contract.file, `operationId '${operationId}' is duplicated; operation IDs are workspace-unique.`, contract.operationIdNode?.getStart() ?? 0));
    }
  }
  return findings;
}

function localHandlerNames(file: FileFact): ReadonlySet<string> {
  const names = new Set<string>();
  walk(file.source, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) names.add(node.name.text);
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
    const value = unwrap(node.initializer);
    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) names.add(node.name.text);
  });
  return names;
}

function compositionRootRules(context: RuleContext): readonly Finding[] {
  const file = context.facts.files.get("src/app.ts");
  if (!file) return [];
  const findings: Finding[] = [];
  const expressFactories = new Set<string>();
  for (const statement of file.source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "express" && statement.importClause?.name) {
      expressFactories.add(statement.importClause.name.text);
    }
  }
  const appNames = new Set<string>();
  const locals = localHandlerNames(file);
  walk(file.source, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(unwrap(node.initializer))) {
      const call = unwrap(node.initializer) as ts.CallExpression;
      const target = unwrap(call.expression);
      if (ts.isIdentifier(target) && expressFactories.has(target.text)) appNames.add(node.name.text);
    }
    if (!ts.isCallExpression(node)) return;
    const target = unwrap(node.expression);
    if (!ts.isPropertyAccessExpression(target) || !ts.isIdentifier(target.expression) || !appNames.has(target.expression.text)) return;
    if (!["all", "delete", "get", "head", "options", "patch", "post", "put", "use"].includes(target.name.text)) return;
    const hidden = node.arguments.find((argument) => {
      if (ts.isSpreadElement(argument)) return false;
      const value = unwrap(argument);
      return ts.isArrowFunction(value) || ts.isFunctionExpression(value) || (ts.isIdentifier(value) && locals.has(value.text));
    });
    if (hidden) {
      findings.push(finding(
        "SKYN0017",
        file,
        "src/app.ts is an explicit composition index; move inline or locally implemented HTTP behavior to an adapter/module and map it here.",
        hidden.getStart(),
      ));
    }
  });
  return findings;
}

function functionBodyForHandle(file: FileFact): readonly ts.ConciseBody[] {
  const bodies: ts.ConciseBody[] = [];
  for (const statement of file.source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === "handle" && statement.body) bodies.push(statement.body);
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "handle" || !declaration.initializer) continue;
      const value = unwrap(declaration.initializer);
      if ((ts.isArrowFunction(value) || ts.isFunctionExpression(value)) && value.body) bodies.push(value.body);
    }
  }
  return bodies;
}

function walkDirectBody(root: ts.Node, visit: (node: ts.Node) => void): void {
  const descend = (node: ts.Node): void => {
    visit(node);
    if (node !== root && ts.isFunctionLike(node)) return;
    ts.forEachChild(node, descend);
  };
  descend(root);
}

function readsAuthenticatedUser(file: FileFact, contract: SliceContractFact): boolean {
  const bodies: ts.Node[] = [...functionBodyForHandle(file)];
  for (const call of callsIn(file)) {
    if (!isImportedCall(file, call, "@skiesjs/express", "mapSlice")) continue;
    const mapping = call.arguments[3];
    if (!mapping || ts.isSpreadElement(mapping)) continue;
    const value = unwrap(mapping);
    if (!ts.isObjectLiteralExpression(value)) continue;
    const composed = directObjectPropertyFunction(value, "handle");
    if (composed?.body) bodies.push(composed.body);
  }
  const currentUserImports = importsFrom(file, "@skiesjs/auth-express", "currentUser");
  for (const body of bodies) {
    let visible = false;
    const currentUserParameters = new Set<string>();
    const parent = body.parent;
    if (ts.isFunctionLike(parent)) {
      for (const parameter of parent.parameters) {
        if (ts.isIdentifier(parameter.name) && /^(?:currentUser|authenticatedUser)$/i.test(parameter.name.text)) {
          currentUserParameters.add(parameter.name.text);
        }
      }
    }
    walkDirectBody(body, (node) => {
      if (visible) return;
      if (ts.isPropertyAccessExpression(node) && node.name.text === "currentUser") visible = true;
      if (ts.isCallExpression(node)) {
        const target = unwrap(node.expression);
        if (ts.isIdentifier(target) && currentUserImports.names.has(target.text)) visible = true;
        if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression) &&
          currentUserImports.namespaces.has(target.expression.text) && target.name.text === "currentUser") visible = true;
      }
      if (ts.isIdentifier(node) && currentUserParameters.has(node.text)) {
        const use = node.parent;
        if ((ts.isPropertyAccessExpression(use) || ts.isElementAccessExpression(use)) && use.expression === node) visible = true;
        if (ts.isCallExpression(use) && use.arguments.includes(node)) visible = true;
        if (ts.isBinaryExpression(use)) visible = true;
      }
    });
    if (visible) return true;
  }
  return false;
}

function currentUserRules(contracts: readonly SliceContractFact[]): readonly Finding[] {
  const findings: Finding[] = [];
  for (const contract of contracts) {
    if (contract.auth !== "required" || readsAuthenticatedUser(contract.file, contract)) continue;
    const auth = contract.object ? objectProperty(contract.object, "auth") : undefined;
    findings.push(finding(
      "SKYN0023",
      contract.file,
      "Required-auth slice must visibly read `currentUser` in its handle or mapSlice-composed handler; authorize metadata alone is not authorization scope.",
      auth?.getStart() ?? contract.call?.getStart() ?? 0,
    ));
  }
  return findings;
}

export function evaluateContractRules(context: RuleContext, contracts: readonly SliceContractFact[]): RuleResult {
  return {
    findings: [...operationIdRules(contracts), ...compositionRootRules(context), ...currentUserRules(contracts)],
    issues: [],
  };
}
