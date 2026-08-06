import ts from "typescript";
import type { SliceContractFact } from "./contract-facts.js";
import type { FileFact } from "./scan.js";
import type { RuleContext, RuleResult } from "./rule-types.js";
import {
  callsIn,
  finding,
  importCandidates,
  importsFrom,
  isImportedCall,
  objectProperty,
  owningModules,
  propertyName,
  stringValue,
  unwrap,
  walk,
} from "./rule-utils.js";
import type { Finding } from "./types.js";

interface CodeMember {
  readonly name: string;
  readonly value: string;
  readonly node: ts.Node;
}

interface RegistryFact {
  readonly file: FileFact;
  readonly name: string;
  readonly declaration: ts.VariableDeclaration;
  readonly members: ReadonlyMap<string, CodeMember>;
  readonly owner?: string;
}

const factoryMethods = new Set([
  "businessRule", "conflict", "forbidden", "internal", "notFound", "rateLimit",
  "unauthorized", "unavailable", "validation",
]);

function declarationFor(call: ts.CallExpression): ts.VariableDeclaration | undefined {
  let current: ts.Node = call;
  while (current.parent && (ts.isParenthesizedExpression(current.parent) || ts.isAsExpression(current.parent) ||
    ts.isSatisfiesExpression(current.parent) || ts.isNonNullExpression(current.parent))) current = current.parent;
  return ts.isVariableDeclaration(current.parent) ? current.parent : undefined;
}

function registries(context: RuleContext): readonly RegistryFact[] {
  const result: RegistryFact[] = [];
  for (const file of context.files) {
    for (const call of callsIn(file)) {
      if (!isImportedCall(file, call, "@skiesjs/openapi", "defineErrorCodes")) continue;
      const declaration = declarationFor(call);
      const argument = call.arguments[0];
      if (!declaration || !ts.isIdentifier(declaration.name) || !argument || ts.isSpreadElement(argument)) continue;
      const value = unwrap(argument);
      if (!ts.isObjectLiteralExpression(value)) continue;
      const members = new Map<string, CodeMember>();
      for (const property of value.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = propertyName(property.name);
        const code = stringValue(property.initializer);
        if (name !== undefined && code !== undefined) members.set(name, { name, value: code, node: property });
      }
      const owners = owningModules(file.relativePath, context.modules);
      result.push({
        file,
        name: declaration.name.text,
        declaration,
        members,
        ...(owners.length === 1 ? { owner: owners[0]!.relativePath } : {}),
      });
    }
  }
  return result;
}

function resolveImportedRegistry(
  context: RuleContext,
  file: FileFact,
  local: string,
  all: readonly RegistryFact[],
): RegistryFact | undefined {
  const own = all.find((registry) => registry.file.relativePath === file.relativePath && registry.name === local);
  if (own) return own;
  for (const statement of file.source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const targets = importCandidates(file.relativePath, statement.moduleSpecifier.text);
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const item of bindings.elements) {
      if (item.name.text !== local) continue;
      const exported = item.propertyName?.text ?? item.name.text;
      return all.find((registry) => targets.includes(registry.file.relativePath) && registry.name === exported);
    }
  }
  return undefined;
}

function registryReference(expression: ts.Expression): { readonly local: string; readonly member: string; readonly node: ts.Node } | undefined {
  const value = unwrap(expression);
  if (!ts.isPropertyAccessExpression(value) || !ts.isIdentifier(value.expression)) return undefined;
  return { local: value.expression.text, member: value.name.text, node: value };
}

function errorFactoryCall(file: FileFact, call: ts.CallExpression): boolean {
  const target = unwrap(call.expression);
  if (!ts.isPropertyAccessExpression(target) || !factoryMethods.has(target.name.text)) return false;
  const errors = importsFrom(file, "@skiesjs/core", "Errors");
  if (ts.isIdentifier(target.expression)) return errors.names.has(target.expression.text);
  return ts.isPropertyAccessExpression(target.expression) && ts.isIdentifier(target.expression.expression) &&
    errors.namespaces.has(target.expression.expression.text) && target.expression.name.text === "Errors";
}

function duplicateFindings(all: readonly RegistryFact[]): readonly Finding[] {
  const byValue = new Map<string, CodeMember[]>();
  const registryForMember = new Map<CodeMember, RegistryFact>();
  for (const registry of all) {
    for (const member of registry.members.values()) {
      const entries = byValue.get(member.value) ?? [];
      entries.push(member);
      byValue.set(member.value, entries);
      registryForMember.set(member, registry);
    }
  }
  const findings: Finding[] = [];
  for (const [value, members] of byValue) {
    if (members.length < 2) continue;
    for (const member of members) {
      const registry = registryForMember.get(member)!;
      findings.push(finding(
        "SKYN0019",
        registry.file,
        `Error-code literal '${value}' is duplicated across registries; one wire code has one owning declaration.`,
        member.node.getStart(),
      ));
    }
  }
  return findings;
}

function validateUse(
  context: RuleContext,
  file: FileFact,
  reference: { readonly local: string; readonly member: string; readonly node: ts.Node },
  all: readonly RegistryFact[],
  used: Set<CodeMember>,
  findings: Finding[],
): void {
  const registry = resolveImportedRegistry(context, file, reference.local, all);
  if (!registry) {
    findings.push(finding("SKYN0019", file, `Error code ${reference.local}.${reference.member} does not resolve by a direct local import to defineErrorCodes.`, reference.node.getStart()));
    return;
  }
  const member = registry.members.get(reference.member);
  if (!member) {
    findings.push(finding("SKYN0019", file, `${registry.name}.${reference.member} is not declared by its defineErrorCodes registry.`, reference.node.getStart()));
    return;
  }
  const useOwners = owningModules(file.relativePath, context.modules);
  if (registry.owner !== undefined && useOwners.length === 1 && useOwners[0]!.relativePath !== registry.owner) {
    findings.push(finding("SKYN0019", file, `${registry.name}.${reference.member} belongs to another module; error-code uses stay with their owning registry.`, reference.node.getStart()));
    return;
  }
  used.add(member);
}

export function evaluateErrorCodeRules(
  context: RuleContext,
  contracts: readonly SliceContractFact[],
): RuleResult {
  const all = registries(context);
  const findings: Finding[] = [...duplicateFindings(all)];
  const used = new Set<CodeMember>();
  for (const file of context.files) {
    for (const call of callsIn(file)) {
      if (!errorFactoryCall(file, call)) continue;
      const argument = call.arguments[0];
      if (!argument || ts.isSpreadElement(argument)) continue;
      const reference = registryReference(argument);
      if (reference) validateUse(context, file, reference, all, used, findings);
    }
  }
  for (const contract of contracts) {
    if (!contract.object) continue;
    for (const propertyName of ["errorCodes", "errors"]) {
      const property = objectProperty(contract.object, propertyName);
      if (!property) continue;
      walk(property.initializer, (node) => {
        if (!ts.isPropertyAccessExpression(node) || !ts.isIdentifier(node.expression)) return;
        validateUse(context, contract.file, { local: node.expression.text, member: node.name.text, node }, all, used, findings);
      });
    }
  }
  for (const registry of all) {
    for (const member of registry.members.values()) {
      if (!used.has(member)) {
        findings.push(finding("SKYN0019", registry.file, `Error code ${registry.name}.${member.name} is declared but never used by an Errors factory or slice contract.`, member.node.getStart()));
      }
    }
  }
  return { findings, issues: [] };
}
