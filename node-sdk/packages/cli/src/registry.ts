const importLine = /^import (?:type )?(?:\{[^}]+\}|\* as [A-Za-z_$][A-Za-z0-9_$]*|[A-Za-z_$][A-Za-z0-9_$]*) from "[^"]+";$/;
const namespaceImport = /^import \* as ([A-Za-z_$][A-Za-z0-9_$]*) from "([^"]+)";$/;
const mapHeader = /^export function mapModules\(([^)]+)\): void \{$/;
const mapCall = /^  ([A-Za-z_$][A-Za-z0-9_$]*)\.map\(([^)]*)\);$/;

interface RegistryShape {
  readonly lines: string[];
  readonly newline: "\n" | "\r\n";
  readonly header: number;
  readonly close: number;
  readonly importIndexes: readonly number[];
  readonly importedAliases: ReadonlyMap<string, string>;
  readonly mappedAliases: ReadonlySet<string>;
  readonly argumentList: string;
  readonly argumentNames: readonly string[];
}

function lineEnding(source: string): "\n" | "\r\n" {
  if (!source.includes("\r\n")) return "\n";
  if (source.replaceAll("\r\n", "").includes("\n")) throw new Error("src/modules.ts has mixed line endings");
  return "\r\n";
}

function inspectRegistry(source: string): RegistryShape {
  const newline = lineEnding(source);
  const lines = source.split(newline);
  const headers = lines.flatMap((line, index) => (mapHeader.test(line) ? [index] : []));
  if (headers.length !== 1) {
    throw new Error("src/modules.ts must contain exactly one typed `export function mapModules(...): void {` registry");
  }
  const header = headers[0]!;
  const headerMatch = mapHeader.exec(lines[header]!)!;
  const parameters = headerMatch[1]!.split(",").map((parameter) => parameter.trim());
  const argumentNames = parameters.map((parameter) => {
    const match = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*.+$/.exec(parameter);
    if (!match) throw new Error("src/modules.ts mapModules parameters must be named and explicitly typed");
    return match[1]!;
  });
  const argumentList = argumentNames.join(", ");
  const importIndexes: number[] = [];
  const importedAliases = new Map<string, string>();
  for (let index = 0; index < header; index += 1) {
    const line = lines[index]!;
    if (line === "") continue;
    if (!importLine.test(line)) throw new Error("src/modules.ts must contain only single-line imports before mapModules");
    importIndexes.push(index);
    const namespace = namespaceImport.exec(line);
    if (namespace) importedAliases.set(namespace[1]!, namespace[2]!);
  }
  if (importIndexes.length === 0) throw new Error("src/modules.ts needs an import before mapModules");

  let close = -1;
  const mappedAliases = new Set<string>();
  for (let index = header + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line === "}") {
      close = index;
      break;
    }
    if (line === "") continue;
    const call = mapCall.exec(line);
    if (!call || call[2] !== argumentList) {
      throw new Error(`src/modules.ts mapModules body must contain only exact \`Alias.map(${argumentList});\` calls`);
    }
    mappedAliases.add(call[1]!);
  }
  if (close === -1 || lines.slice(close + 1).some((line) => line !== "")) {
    throw new Error("src/modules.ts mapModules must have one top-level closing brace and no trailing code");
  }
  return { lines, newline, header, close, importIndexes, importedAliases, mappedAliases, argumentList, argumentNames };
}

/** Whether the canonical registry passes an OpenAPI registry as its second explicit map argument. */
export function moduleRegistryUsesOpenApi(source: string): boolean {
  return inspectRegistry(source).argumentNames.length > 1;
}

/** Register one generated module only when src/modules.ts has the small, explicit canonical structure. */
export function registerModule(source: string, alias: string, specifier: string): string {
  const shape = inspectRegistry(source);
  if (
    shape.importedAliases.has(alias)
    || [...shape.importedAliases.values()].includes(specifier)
    || shape.mappedAliases.has(alias)
  ) {
    throw new Error(`${alias} is already registered in src/modules.ts`);
  }
  for (const mapped of shape.mappedAliases) {
    if (!shape.importedAliases.has(mapped)) throw new Error(`src/modules.ts maps ${mapped} without a matching namespace import`);
  }

  shape.lines.splice(shape.close, 0, `  ${alias}.map(${shape.argumentList});`);
  const lastImport = shape.importIndexes.at(-1)!;
  shape.lines.splice(lastImport + 1, 0, `import * as ${alias} from ${JSON.stringify(specifier)};`);
  return shape.lines.join(shape.newline);
}
