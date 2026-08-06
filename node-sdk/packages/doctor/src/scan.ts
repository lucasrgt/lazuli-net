import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { InspectionIssue } from "./types.js";

const skippedDirectories = new Set(["node_modules", "dist", "build"]);
const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export interface NamespaceImport {
  readonly alias: string;
  readonly specifier: string;
}

export interface FileFact {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly text: string;
  readonly source: ts.SourceFile;
  readonly symbols: ReadonlySet<string>;
  readonly namespaceImports: readonly NamespaceImport[];
  readonly mapCalls: ReadonlySet<string>;
}

export interface WorkspaceFacts {
  readonly absoluteRoot: string;
  readonly displayRoot: string;
  readonly files: ReadonlyMap<string, FileFact>;
  readonly issues: readonly InspectionIssue[];
}

export function normalizeSlashes(value: string): string {
  return value.replaceAll("\\", "/");
}

function relativePath(root: string, absolutePath: string): string {
  return normalizeSlashes(path.relative(root, absolutePath));
}

function issuePath(root: string, absolutePath: string): string {
  const relative = relativePath(root, absolutePath);
  return relative === "" ? "." : relative;
}

async function collectTypeScriptFiles(
  root: string,
  directory: string,
  files: string[],
  issues: InspectionIssue[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (caught) {
    issues.push({ path: issuePath(root, directory), message: `Cannot read directory: ${errorMessage(caught)}` });
    return;
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) await collectTypeScriptFiles(root, absolutePath, files, issues);
      continue;
    }
    if (entry.isFile() && /\.(?:cts|mts|tsx?|d\.ts)$/.test(entry.name)) files.push(absolutePath);
  }
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(ts.getModifiers(node as ts.HasModifiers)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function addBindingName(name: ts.BindingName, symbols: Set<string>): void {
  if (ts.isIdentifier(name)) {
    symbols.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) addBindingName(element.name, symbols);
  }
}

function declarationName(node: ts.Node): ts.DeclarationName | undefined {
  if (
    ts.isClassDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isParameter(node)
  ) {
    return node.name;
  }
  return undefined;
}

function collectSymbols(source: ts.SourceFile, isTest: boolean): ReadonlySet<string> {
  const symbols = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) addBindingName(node.name, symbols);
    if (ts.isImportClause(node) && node.name) symbols.add(node.name.text);
    if (ts.isNamespaceImport(node) || ts.isImportSpecifier(node) || ts.isImportEqualsDeclaration(node)) {
      symbols.add(node.name.text);
    }
    const name = declarationName(node);
    if (name && ts.isIdentifier(name)) symbols.add(name.text);

    if (ts.isExportSpecifier(node)) {
      symbols.add(node.name.text);
      if (node.propertyName) symbols.add(node.propertyName.text);
    }
    if (ts.isNamespaceExport(node)) symbols.add(node.name.text);

    if (isTest && ts.isCallExpression(node) && node.arguments.length > 0) {
      const first = node.arguments[0];
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) && identifier.test(first.text)) {
        symbols.add(first.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return symbols;
}

function collectImports(source: ts.SourceFile): readonly NamespaceImport[] {
  const imports: NamespaceImport[] = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const binding = statement.importClause?.namedBindings;
    if (binding && ts.isNamespaceImport(binding)) {
      imports.push({ alias: binding.name.text, specifier: normalizeSlashes(statement.moduleSpecifier.text) });
    }
  }
  return imports;
}

function collectMapCalls(source: ts.SourceFile): ReadonlySet<string> {
  const aliases = new Set<string>();
  const visitBody = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.name.text === "map"
    ) {
      aliases.add(node.expression.expression.text);
    }
    ts.forEachChild(node, visitBody);
  };

  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.body &&
      statement.name &&
      (statement.name.text === "map" || statement.name.text === "mapModules") &&
      hasExportModifier(statement)
    ) {
      visitBody(statement.body);
      continue;
    }
    if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        (declaration.name.text === "map" || declaration.name.text === "mapModules") &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
      ) {
        visitBody(declaration.initializer.body);
      }
    }
  }
  return aliases;
}

function syntaxIssues(root: string, file: string, source: ts.SourceFile): readonly InspectionIssue[] {
  const parsed = source as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] };
  return (parsed.parseDiagnostics ?? []).map((diagnostic) => {
    const start = diagnostic.start ?? 0;
    const location = source.getLineAndCharacterOfPosition(start);
    return {
      path: issuePath(root, file),
      message: `TypeScript syntax error at ${location.line + 1}:${location.character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
    };
  });
}

async function parseFile(root: string, absolutePath: string, issues: InspectionIssue[]): Promise<FileFact | undefined> {
  let text: string;
  try {
    text = await readFile(absolutePath, "utf8");
  } catch (caught) {
    issues.push({ path: issuePath(root, absolutePath), message: `Cannot read file: ${errorMessage(caught)}` });
    return undefined;
  }

  const relative = relativePath(root, absolutePath);
  const scriptKind = relative.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, scriptKind);
  issues.push(...syntaxIssues(root, absolutePath, source));
  return {
    absolutePath,
    relativePath: relative,
    text,
    source,
    symbols: collectSymbols(source, /(?:^|\/)[^/]*\.test\.[^/]+$/.test(relative)),
    namespaceImports: collectImports(source),
    mapCalls: collectMapCalls(source),
  };
}

export async function scanWorkspace(root: string): Promise<WorkspaceFacts> {
  const absoluteRoot = path.resolve(root);
  const sourceRoot = path.join(absoluteRoot, "src");
  const paths: string[] = [];
  const issues: InspectionIssue[] = [];
  await collectTypeScriptFiles(absoluteRoot, sourceRoot, paths, issues);

  const facts = await Promise.all(paths.map((file) => parseFile(absoluteRoot, file, issues)));
  const files = new Map<string, FileFact>();
  for (const fact of facts) {
    if (fact) files.set(fact.relativePath, fact);
  }
  return { absoluteRoot, displayRoot: normalizeSlashes(absoluteRoot), files, issues };
}

export function isDirectlyExported(node: ts.Node): boolean {
  return hasExportModifier(node);
}
