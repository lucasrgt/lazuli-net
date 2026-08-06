import path from "node:path";

export interface GeneratorOptions {
  readonly cwd: string;
  readonly root: string;
  readonly dryRun?: boolean;
}

export function toKebab(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

export function toCamel(value: string): string {
  const words = toKebab(value).split("-");
  return words[0]! + words.slice(1).map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join("");
}

export function requireIdentifier(value: string, label: string): void {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(value)) throw new Error(`${label} must be a PascalCase identifier`);
}

export function sourceRoot(options: GeneratorOptions): { readonly cwd: string; readonly source: string } {
  const cwd = path.resolve(options.cwd);
  const source = path.resolve(cwd, options.root);
  const relative = path.relative(cwd, source);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`source root escapes application directory: ${options.root}`);
  }
  return { cwd, source };
}

export function requireStableCode(value: string): void {
  if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/.test(value)) {
    throw new Error("error code must be a stable lowercase code such as billing.invoice_not_found");
  }
}
