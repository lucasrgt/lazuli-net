import path from "node:path";
import ts from "typescript";
import { normalizeSlashes, type FileFact } from "./scan.js";
import type { Finding, RuleId } from "./types.js";

export function finding(
  code: RuleId,
  file: FileFact,
  message: string,
  offset = 0,
  displayPath = file.relativePath,
): Finding {
  const location = file.source.getLineAndCharacterOfPosition(Math.min(Math.max(offset, 0), file.text.length));
  return { code, path: displayPath, line: location.line + 1, column: location.character + 1, message };
}

export function expectedSibling(relativePath: string, suffix: string, replacement: string): string {
  return `${relativePath.slice(0, -suffix.length)}${replacement}`;
}

export function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

export function propertyName(name: ts.PropertyName | ts.MemberName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

export function objectProperty(object: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return object.properties.find(
    (item): item is ts.PropertyAssignment => ts.isPropertyAssignment(item) && propertyName(item.name) === name,
  );
}

export function stringValue(expression: ts.Expression | undefined): string | undefined {
  if (!expression) return undefined;
  const value = unwrap(expression);
  return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value) ? value.text : undefined;
}

interface Imports {
  readonly names: ReadonlySet<string>;
  readonly namespaces: ReadonlySet<string>;
}

export function importsFrom(file: FileFact, packageName: string, exportedName: string): Imports {
  const names = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of file.source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== packageName) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const item of bindings.elements) {
      if ((item.propertyName?.text ?? item.name.text) === exportedName) names.add(item.name.text);
    }
  }
  return { names, namespaces };
}

export function isImportedCall(
  file: FileFact,
  call: ts.CallExpression,
  packageName: string,
  exportedName: string,
): boolean {
  const imports = importsFrom(file, packageName, exportedName);
  const expression = unwrap(call.expression);
  if (ts.isIdentifier(expression)) return imports.names.has(expression.text);
  return ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    imports.namespaces.has(expression.expression.text) &&
    expression.name.text === exportedName;
}

export function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

export function callsIn(file: FileFact): readonly ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  walk(file.source, (node) => { if (ts.isCallExpression(node)) calls.push(node); });
  return calls;
}

export function importCandidates(importer: string, specifier: string): readonly string[] {
  if (!specifier.startsWith(".")) return [];
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(importer), normalizeSlashes(specifier)));
  const candidates = new Set<string>([joined]);
  if (/\.(?:js|mjs|cjs)$/.test(joined)) {
    const stem = joined.replace(/\.(?:js|mjs|cjs)$/, "");
    candidates.add(`${stem}.ts`);
    candidates.add(`${stem}.mts`);
    candidates.add(`${stem}.cts`);
  } else if (!/\.[^/]+$/.test(joined)) {
    candidates.add(`${joined}.ts`);
    candidates.add(`${joined}/index.ts`);
  }
  return [...candidates];
}

export function moduleDirectory(relativePath: string): string {
  return path.posix.dirname(relativePath);
}

export function isWithin(relativePath: string, directory: string): boolean {
  return relativePath === directory || relativePath.startsWith(`${directory}/`);
}

export function owningModules(relativePath: string, modules: readonly FileFact[]): readonly FileFact[] {
  const candidates = modules.filter((module) => isWithin(relativePath, moduleDirectory(module.relativePath)));
  if (candidates.length === 0) return [];
  const deepest = Math.max(...candidates.map((module) => moduleDirectory(module.relativePath).length));
  return candidates.filter((module) => moduleDirectory(module.relativePath).length === deepest);
}

export function isDirectExpressionCall(call: ts.CallExpression): boolean {
  let current: ts.Node = call;
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) || ts.isAsExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent) || ts.isNonNullExpression(current.parent))
  ) current = current.parent;
  return ts.isExpressionStatement(current.parent);
}

export interface LineDirective {
  readonly payload: string;
  readonly offset: number;
  readonly start: number;
  readonly end: number;
}

/** Read exact single-line comment directives without mistaking strings/templates for comments. */
export function lineDirectives(file: FileFact, name: string): readonly LineDirective[] {
  const directives: LineDirective[] = [];
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, file.source.languageVariant, file.text);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia) continue;
    const text = scanner.getTokenText();
    const match = new RegExp(`^//[ \t]*@skies-${name}\\b(.*)$`).exec(text);
    if (!match) continue;
    const raw = match[1] ?? "";
    const payload = raw.trim();
    const tokenStart = scanner.getTokenPos();
    const within = payload.length === 0 ? text.length : text.indexOf(payload);
    directives.push({
      payload,
      offset: tokenStart + within,
      start: tokenStart,
      end: scanner.getTextPos(),
    });
  }
  return directives;
}
