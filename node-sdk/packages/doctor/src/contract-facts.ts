import ts from "typescript";
import type { FileFact } from "./scan.js";
import { callsIn, isImportedCall, lineDirectives, objectProperty, propertyName, stringValue, unwrap } from "./rule-utils.js";

export interface CriterionDeclaration {
  readonly id: string;
  readonly offset: number;
  readonly source: "contract" | "comment";
}

export interface SliceContractFact {
  readonly file: FileFact;
  readonly call?: ts.CallExpression;
  readonly declaration?: ts.VariableDeclaration;
  readonly object?: ts.ObjectLiteralExpression;
  readonly operationId?: string;
  readonly operationIdNode?: ts.Node;
  readonly method?: string;
  readonly auth?: string;
  readonly criteria: readonly CriterionDeclaration[];
  readonly malformedCriteriaOffset?: number;
  readonly canonical: boolean;
  readonly callCount: number;
}

function declarationFor(call: ts.CallExpression): ts.VariableDeclaration | undefined {
  let current: ts.Node = call;
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) || ts.isAsExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent) || ts.isNonNullExpression(current.parent))
  ) current = current.parent;
  return ts.isVariableDeclaration(current.parent) ? current.parent : undefined;
}

function isCanonical(declaration: ts.VariableDeclaration | undefined): boolean {
  if (!declaration || !ts.isIdentifier(declaration.name) || declaration.name.text !== "contract") return false;
  const list = declaration.parent;
  const statement = list.parent;
  return ts.isVariableDeclarationList(list) && Boolean(list.flags & ts.NodeFlags.Const) &&
    ts.isVariableStatement(statement) &&
    Boolean(ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function commentCriteria(file: FileFact): readonly CriterionDeclaration[] {
  return lineDirectives(file, "criterion")
    .filter((directive) => /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(directive.payload))
    .map((directive) => ({ id: directive.payload, offset: directive.offset, source: "comment" }));
}

function contractCriteria(object: ts.ObjectLiteralExpression | undefined): {
  readonly criteria: readonly CriterionDeclaration[];
  readonly malformed?: number;
} {
  if (!object) return { criteria: [] };
  const property = objectProperty(object, "criteria");
  if (!property) return { criteria: [] };
  const value = unwrap(property.initializer);
  if (!ts.isArrayLiteralExpression(value) || value.elements.length === 0) {
    return { criteria: [], malformed: property.initializer.getStart() };
  }
  const criteria: CriterionDeclaration[] = [];
  for (const element of value.elements) {
    if (ts.isSpreadElement(element)) return { criteria, malformed: element.getStart() };
    const id = stringValue(element);
    if (id === undefined || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
      return { criteria, malformed: element.getStart() };
    }
    criteria.push({ id, offset: element.getStart(), source: "contract" });
  }
  return { criteria };
}

export function readSliceContract(file: FileFact): SliceContractFact {
  const calls = callsIn(file).filter((call) => isImportedCall(file, call, "@skiesjs/openapi", "defineContract"));
  const canonicalCall = calls.find((call) => isCanonical(declarationFor(call))) ?? calls[0];
  const declaration = canonicalCall ? declarationFor(canonicalCall) : undefined;
  const first = canonicalCall?.arguments[0];
  const object = first && !ts.isSpreadElement(first) && ts.isExpression(first) && ts.isObjectLiteralExpression(unwrap(first))
    ? unwrap(first) as ts.ObjectLiteralExpression
    : undefined;
  const operation = object ? objectProperty(object, "operationId") : undefined;
  const method = object ? objectProperty(object, "method") : undefined;
  const auth = object ? objectProperty(object, "auth") : undefined;
  const declared = contractCriteria(object);
  return {
    file,
    ...(canonicalCall === undefined ? {} : { call: canonicalCall }),
    ...(declaration === undefined ? {} : { declaration }),
    ...(object === undefined ? {} : { object }),
    ...(operation === undefined || stringValue(operation.initializer) === undefined
      ? {}
      : { operationId: stringValue(operation.initializer)! }),
    ...(operation === undefined ? {} : { operationIdNode: operation.initializer }),
    ...(method === undefined || stringValue(method.initializer) === undefined
      ? {}
      : { method: stringValue(method.initializer)! }),
    ...(auth === undefined || stringValue(auth.initializer) === undefined
      ? {}
      : { auth: stringValue(auth.initializer)! }),
    criteria: [...declared.criteria, ...commentCriteria(file)],
    ...(declared.malformed === undefined ? {} : { malformedCriteriaOffset: declared.malformed }),
    canonical: isCanonical(declaration),
    callCount: calls.length,
  };
}

export function directObjectPropertyFunction(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration | undefined {
  const property = object.properties.find((item) =>
    (ts.isPropertyAssignment(item) || ts.isMethodDeclaration(item)) && propertyName(item.name) === name,
  );
  if (!property || (!ts.isPropertyAssignment(property) && !ts.isMethodDeclaration(property))) return undefined;
  if (ts.isMethodDeclaration(property)) return property;
  const value = unwrap(property.initializer);
  return ts.isArrowFunction(value) || ts.isFunctionExpression(value) ? value : undefined;
}
