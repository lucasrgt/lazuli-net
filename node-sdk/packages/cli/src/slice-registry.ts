const mapHeader = /^export function map\(([^)]+)\): void \{$/;
const namespaceImport = /^import \* as ([A-Za-z_$][A-Za-z0-9_$]*) from "([^"]+)";$/;
const routerDeclaration = /^  const ([A-Za-z_$][A-Za-z0-9_$]*) = Router\(\);$/;
const useCall = /^  ([A-Za-z_$][A-Za-z0-9_$]*)\.use\(([A-Za-z_$][A-Za-z0-9_$]*)\);$/;
const sliceCall = /^  ([A-Za-z_$][A-Za-z0-9_$]*)\.map\(([A-Za-z_$][A-Za-z0-9_$]*), ([A-Za-z_$][A-Za-z0-9_$]*)\);$/;

function newlineOf(source: string): "\n" | "\r\n" {
  if (!source.includes("\r\n")) return "\n";
  if (source.replaceAll("\r\n", "").includes("\n")) throw new Error("module file has mixed line endings");
  return "\r\n";
}

function parameterNames(header: string): readonly string[] {
  const match = mapHeader.exec(header);
  if (!match) return [];
  return match[1]!.split(",").map((parameter) => {
    const parsed = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*.+$/.exec(parameter);
    if (!parsed) throw new Error("module map parameters must be named and explicitly typed");
    return parsed[1]!;
  });
}

/** Whether a module exposes the current Router + OpenAPI map seam that can accept generated slices. */
export function supportsSliceRegistration(source: string): boolean {
  return source.includes("OpenApiRegistry") && source.split(/\r?\n/).some((line) => routerDeclaration.test(line));
}

/** Insert one visible namespace import and map call into the small current module template. */
export function registerSlice(source: string, alias: string, specifier: string): string {
  const newline = newlineOf(source);
  const lines = source.split(newline);
  const headers = lines.flatMap((line, index) => (mapHeader.test(line) ? [index] : []));
  if (headers.length !== 1) throw new Error("module must contain exactly one typed `export function map(...): void {`");
  const header = headers[0]!;
  const parameters = parameterNames(lines[header]!);
  if (parameters.length < 2) throw new Error("module map must accept app/router and OpenAPI registry parameters");
  const imported = new Map<string, string>();
  const importIndexes: number[] = [];
  for (let index = 0; index < header; index += 1) {
    const line = lines[index]!;
    if (line.startsWith("import ")) importIndexes.push(index);
    const namespace = namespaceImport.exec(line);
    if (namespace) imported.set(namespace[1]!, namespace[2]!);
  }
  if (importIndexes.length === 0) throw new Error("module needs imports before map");
  if (imported.has(alias) || [...imported.values()].includes(specifier)) {
    throw new Error(`${alias} is already registered in its module`);
  }

  const routers = lines.slice(header + 1).flatMap((line) => {
    const match = routerDeclaration.exec(line);
    return match ? [match[1]!] : [];
  });
  if (routers.length !== 1) throw new Error("module map must create exactly one explicit Router");
  const router = routers[0]!;
  const app = parameters[0]!;
  const openApi = parameters[1]!;
  const useIndexes = lines.flatMap((line, index) => {
    const match = useCall.exec(line);
    return match?.[1] === app && match[2] === router ? [index] : [];
  });
  if (useIndexes.length !== 1) throw new Error(`module map must call ${app}.use(${router}) exactly once`);
  for (const line of lines.slice(header + 1, useIndexes[0])) {
    const call = sliceCall.exec(line);
    if (call && (call[1] === alias || call[2] !== router || call[3] !== openApi)) {
      throw new Error("module slice map calls must use the module Router and OpenAPI registry parameters");
    }
  }

  lines.splice(useIndexes[0]!, 0, `  ${alias}.map(${router}, ${openApi});`);
  lines.splice(importIndexes.at(-1)! + 1, 0, `import * as ${alias} from ${JSON.stringify(specifier)};`);
  return lines.join(newline);
}


/** Insert one visible error-registry import and registration into the current module composition seam. */
export function registerErrorRegistry(source: string, symbol: string, specifier: string): string {
  const newline = newlineOf(source);
  const lines = source.split(newline);
  const headers = lines.flatMap((line, index) => (mapHeader.test(line) ? [index] : []));
  if (headers.length !== 1) throw new Error("module must contain exactly one typed `export function map(...): void {`");
  const header = headers[0]!;
  const parameters = parameterNames(lines[header]!);
  if (parameters.length < 2) throw new Error("module map must accept app/router and OpenAPI registry parameters");
  const importIndexes = lines.flatMap((line, index) => index < header && line.startsWith("import ") ? [index] : []);
  if (importIndexes.length === 0) throw new Error("module needs imports before map");
  if (lines.some((line) => line.includes(`{ ${symbol} } from ${JSON.stringify(specifier)}`))) {
    throw new Error(`${symbol} is already registered in its module`);
  }
  const app = parameters[0]!;
  const openApi = parameters[1]!;
  const useIndexes = lines.flatMap((line, index) => {
    const match = useCall.exec(line);
    return match?.[1] === app ? [index] : [];
  });
  if (useIndexes.length !== 1) throw new Error(`module map must call ${app}.use(...) exactly once`);
  lines.splice(useIndexes[0]!, 0, `  ${openApi}.registerErrorCodes(${symbol});`);
  lines.splice(importIndexes.at(-1)! + 1, 0, `import { ${symbol} } from ${JSON.stringify(specifier)};`);
  return lines.join(newline);
}
