import { readdir, rm } from "node:fs/promises";
import path from "node:path";

for (const directory of ["packages", "examples"]) {
  const root = path.resolve(import.meta.dirname, `../${directory}`);
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory()) await rm(path.join(root, entry.name, "dist"), { recursive: true, force: true });
  }
}
