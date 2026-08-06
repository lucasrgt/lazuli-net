import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { scanSuppressions } from "./index.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

it("finds enforcement suppressions with stable locations while excluding dependencies and output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "skies-suppression-"));
  roots.push(root);
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "dist"));
  await writeFile(
    path.join(root, "src/app.ts"),
    [
      "const ok = true;",
      "// eslint-disable-next-line no-console",
      "console.log(ok);",
      "// @ts-ignore",
      "/* v8 ignore next */",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(root, "dist/output.js"), "// eslint-disable\n");

  expect(await scanSuppressions(root)).toEqual([
    "src/app.ts:2: ESLint disable is forbidden in verified source",
    "src/app.ts:4: TypeScript suppression is forbidden in verified source",
    "src/app.ts:5: coverage/test suppression is forbidden in verified source",
  ]);
});

it("fails closed on an application symlink but permits the ordinary node_modules workspace link", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "skies-suppression-link-"));
  roots.push(root);
  await mkdir(path.join(root, "target"));
  await symlink(path.join(root, "target"), path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  await symlink(path.join(root, "target"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");

  expect(await scanSuppressions(root)).toEqual(["linked: symbolic links are not inspected by the gate"]);
});
