import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { isDirectlyExported, type FileFact } from "./scan.js";
import type { RuleContext, RuleResult } from "./rule-types.js";
import { expectedSibling, finding, importCandidates, owningModules } from "./rule-utils.js";
import type { Finding, InspectionIssue, RuleId } from "./types.js";

interface ContextFile { readonly relativePath: string; readonly text: string }
interface Citation { readonly identifier: string; readonly offset: number }
const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function markdownFinding(code: RuleId, context: ContextFile, message: string, offset = 0): Finding {
  const before = context.text.slice(0, offset);
  const lines = before.split(/\r?\n/);
  return {
    code,
    path: context.relativePath,
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
    message,
  };
}

function exportedMapLocals(source: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isVariableStatement(statement)) &&
      isDirectlyExported(statement) &&
      !ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === "map") names.add("map");
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.name.text === "map") names.add("map");
        }
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const specifier of statement.exportClause.elements) {
        if (specifier.name.text === "map" && !statement.moduleSpecifier) {
          names.add(specifier.propertyName?.text ?? specifier.name.text);
        }
      }
    }
  }
  return names;
}

function isAsync(node: ts.FunctionLikeDeclaration): boolean {
  return Boolean(ts.getModifiers(node as ts.HasModifiers)?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword));
}

function isTypedSynchronousMap(node: ts.FunctionLikeDeclaration): boolean {
  return Boolean(node.body) && !isAsync(node) && node.parameters.length > 0 &&
    node.parameters.every((parameter) => Boolean(parameter.type)) && node.type?.kind === ts.SyntaxKind.VoidKeyword;
}

function hasValidModuleMap(module: FileFact): boolean {
  const exportedLocals = exportedMapLocals(module.source);
  for (const statement of module.source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && exportedLocals.has(statement.name.text)) {
      if (isTypedSynchronousMap(statement)) return true;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !exportedLocals.has(declaration.name.text) || !declaration.initializer) continue;
      if ((ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) &&
        isTypedSynchronousMap(declaration.initializer)) return true;
    }
  }
  return false;
}

function importsAndCallsMap(importer: FileFact | undefined, target: FileFact): boolean {
  if (!importer) return false;
  return importer.namespaceImports.some((entry) =>
    importCandidates(importer.relativePath, entry.specifier).includes(target.relativePath) &&
    importer.mapCalls.has(entry.alias));
}

function contextSections(text: string): ReadonlyMap<string, { readonly offset: number; readonly body: string }> {
  const headings: { name: string; offset: number; contentStart: number }[] = [];
  const expression = /^##[ \t]+(.+?)[ \t]*\r?$/gm;
  for (const match of text.matchAll(expression)) {
    headings.push({ name: match[1] ?? "", offset: match.index, contentStart: match.index + match[0].length });
  }
  const sections = new Map<string, { offset: number; body: string }>();
  for (const [index, heading] of headings.entries()) {
    const body = text.slice(heading.contentStart, headings[index + 1]?.offset ?? text.length);
    const existing = sections.get(heading.name);
    if (!existing || (existing.body.trim() === "" && body.trim() !== "")) {
      sections.set(heading.name, { offset: heading.offset, body });
    }
  }
  return sections;
}

function citations(text: string): readonly Citation[] {
  const found: Citation[] = [];
  let offset = 0;
  let fence: "```" | "~~~" | undefined;
  for (const line of text.split(/(?<=\n)/)) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      const marker = trimmed.startsWith("```") ? "```" : "~~~";
      fence = fence === marker ? undefined : fence ?? marker;
      offset += line.length;
      continue;
    }
    if (!fence) {
      const expression = /(^|[^`])`([A-Za-z_$][A-Za-z0-9_$]*)`(?!`)/g;
      for (const match of line.matchAll(expression)) {
        const value = match[2];
        if (value && identifier.test(value)) found.push({ identifier: value, offset: offset + match.index + match[1]!.length });
      }
    }
    offset += line.length;
  }
  return found;
}

async function readContext(context: RuleContext, module: FileFact, issues: InspectionIssue[]): Promise<ContextFile | undefined> {
  const relativePath = expectedSibling(module.relativePath, ".module.ts", ".ctx.md");
  const absolutePath = path.join(context.facts.absoluteRoot, ...relativePath.split("/"));
  try {
    return { relativePath, text: await readFile(absolutePath, "utf8") };
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    issues.push({ path: relativePath, message: `Cannot read module context: ${caught instanceof Error ? caught.message : String(caught)}` });
    return undefined;
  }
}

export async function evaluateBaseRules(context: RuleContext): Promise<RuleResult> {
  const findings: Finding[] = [];
  const issues: InspectionIssue[] = [];
  for (const slice of context.slices) {
    const test = expectedSibling(slice.relativePath, ".slice.ts", ".slice.test.ts");
    if (!context.facts.files.has(test)) findings.push(finding("SKYN0003", slice, `Slice requires the exact sibling test ${path.posix.basename(test)}.`));
  }

  for (const module of context.modules) {
    const contextPath = expectedSibling(module.relativePath, ".module.ts", ".ctx.md");
    const moduleContext = await readContext(context, module, issues);
    if (!moduleContext) {
      if (!issues.some((issue) => issue.path === contextPath)) {
        findings.push(finding("SKYN0004", module, `Module requires the exact sibling context ${path.posix.basename(contextPath)}.`));
      }
    } else {
      const sections = contextSections(moduleContext.text);
      for (const name of ["Boundaries", "Design notes"] as const) {
        const section = sections.get(name);
        if (!section) findings.push(markdownFinding("SKYN0004", moduleContext, `Module context requires a nonempty ## ${name} section.`));
        else if (section.body.trim() === "") findings.push(markdownFinding("SKYN0004", moduleContext, `The ## ${name} section must not be empty.`, section.offset));
      }
      const ownedSymbols = new Set<string>();
      for (const file of context.files) {
        const owners = owningModules(file.relativePath, context.modules);
        if (owners.length === 1 && owners[0]?.relativePath === module.relativePath) {
          for (const symbol of file.symbols) ownedSymbols.add(symbol);
        }
      }
      for (const citation of citations(moduleContext.text)) {
        if (!ownedSymbols.has(citation.identifier)) {
          findings.push(markdownFinding("SKYN0005", moduleContext, `Citation \`${citation.identifier}\` does not resolve to a declaration, export, or test in this module.`, citation.offset));
        }
      }
    }
    if (!hasValidModuleMap(module)) findings.push(finding("SKYN0015", module, "Module must export a synchronous map with typed parameters and an explicit void return."));
  }

  const registry = context.facts.files.get("src/modules.ts");
  for (const module of context.modules) {
    if (!importsAndCallsMap(registry, module)) findings.push(finding("SKYN0016", module, "Module must be namespace-imported and have its map called by src/modules.ts."));
  }
  for (const slice of context.slices) {
    const owners = owningModules(slice.relativePath, context.modules);
    if (owners.length !== 1) findings.push(finding("SKYN0016", slice, "Slice must have exactly one owning module in its directory ancestry."));
    else if (!importsAndCallsMap(owners[0], slice)) findings.push(finding("SKYN0016", slice, "Slice must be namespace-imported and have its map called by its owning module."));
  }
  return { findings, issues };
}
