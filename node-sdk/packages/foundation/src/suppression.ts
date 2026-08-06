import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ignoredDirectories = new Set([".git", ".skies", "build", "coverage", "dist", "node_modules", "obj"]);
const sourceExtension = /\.(?:cjs|cts|js|json|jsx|mjs|mts|ts|tsx|yaml|yml)$/u;
const suppressions: readonly { readonly pattern: RegExp; readonly name: string }[] = [
  { pattern: /eslint-disable(?:-line|-next-line)?/u, name: "ESLint disable" },
  { pattern: /@ts-(?:ignore|nocheck|expect-error)/u, name: "TypeScript suppression" },
  { pattern: /(?:c8|istanbul|v8|vitest)\s+ignore/u, name: "coverage/test suppression" },
];

/** Find source-level enforcement escapes. Generated, dependency, VCS, and receipt directories are excluded. */
export async function scanSuppressions(root: string): Promise<readonly string[]> {
  const findings: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      const relative = path.relative(root, target).split(path.sep).join("/");
      if (entry.isSymbolicLink()) {
        if (relative !== "node_modules" && !relative.startsWith("node_modules/")) findings.push(`${relative}: symbolic links are not inspected by the gate`);
        continue;
      }
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await visit(target);
        continue;
      }
      if (!entry.isFile() || !sourceExtension.test(entry.name) || relative.startsWith("VERIFICATION.")) continue;
      let text: string;
      try { text = await readFile(target, "utf8"); } catch (error) {
        findings.push(`${relative}: cannot scan suppressions: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      for (const [index, line] of text.split(/\r?\n/u).entries()) {
        for (const rule of suppressions) {
          if (rule.pattern.test(line)) findings.push(`${relative}:${index + 1}: ${rule.name} is forbidden in verified source`);
        }
      }
      const info = await lstat(target);
      if (!info.isFile()) findings.push(`${relative}: changed type while suppression scanning`);
    }
  };
  await visit(root);
  return findings.sort((left, right) => left.localeCompare(right));
}
