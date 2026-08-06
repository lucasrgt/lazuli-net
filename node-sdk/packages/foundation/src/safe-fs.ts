import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { FoundationError } from "./types.js";
import { normalizeRelativePath } from "./config.js";

export interface TextChange {
  readonly path: string;
  readonly content: string;
  readonly overwrite: boolean;
}

export interface TextAction {
  readonly path: string;
  readonly action: "create" | "update" | "unchanged";
}

async function statOrUndefined(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try { return await lstat(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function withinRoot(rootValue: string, relativePath: string): { root: string; path: string; relative: string } {
  const root = resolve(rootValue);
  const safe = normalizeRelativePath(relativePath, "asset path");
  const path = resolve(root, safe);
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new FoundationError(`path '${relativePath}' escapes the workspace`, "invocation");
  }
  return { root, path, relative: safe };
}

async function assertNoSymlinks(root: string, target: string): Promise<void> {
  const rootStat = await statOrUndefined(root);
  if (rootStat === undefined || !rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new FoundationError(`workspace root '${root}' must be a real directory`, "io");
  }
  const fromRoot = relative(root, target).split(sep).filter(Boolean);
  let cursor = root;
  for (const part of fromRoot) {
    cursor = resolve(cursor, part);
    const stat = await statOrUndefined(cursor);
    if (stat?.isSymbolicLink() === true) throw new FoundationError(`refusing symbolic link '${cursor}'`, "io");
    if (cursor !== target && stat !== undefined && !stat.isDirectory()) {
      throw new FoundationError(`asset parent '${cursor}' is not a directory`, "io");
    }
  }
}

async function ensureParent(root: string, target: string): Promise<void> {
  const parts = relative(root, dirname(target)).split(sep).filter(Boolean);
  let cursor = root;
  for (const part of parts) {
    cursor = resolve(cursor, part);
    const stat = await statOrUndefined(cursor);
    if (stat === undefined) await mkdir(cursor);
    else if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new FoundationError(`unsafe asset parent '${cursor}'`, "io");
    }
  }
}

export async function assertSafeDirectory(rootValue: string, relativePath: string): Promise<string> {
  const target = withinRoot(rootValue, relativePath);
  await assertNoSymlinks(target.root, target.path);
  const stat = await statOrUndefined(target.path);
  if (stat === undefined) throw new FoundationError(`directory '${target.relative}' is missing`, "io");
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new FoundationError(`directory '${target.relative}' is unsafe`, "io");
  }
  return target.path;
}

export async function readSafeText(rootValue: string, relativePath: string): Promise<string | undefined> {
  const target = withinRoot(rootValue, relativePath);
  await assertNoSymlinks(target.root, target.path);
  const stat = await statOrUndefined(target.path);
  if (stat === undefined) return undefined;
  if (!stat.isFile()) throw new FoundationError(`asset '${target.relative}' is not a regular file`, "io");
  return readFile(target.path, "utf8");
}

export async function applyTextPlan(
  rootValue: string,
  changes: readonly TextChange[],
  dryRun = false,
): Promise<readonly TextAction[]> {
  const root = resolve(rootValue);
  const paths = changes.map((change) => ({ change, ...withinRoot(root, change.path) }));
  const unique = new Set<string>();
  for (const item of paths) {
    if (unique.has(item.relative)) throw new FoundationError(`asset plan repeats '${item.relative}'`, "config");
    unique.add(item.relative);
    await assertNoSymlinks(root, item.path);
  }
  const states = await Promise.all(paths.map(async (item) => {
    const stat = await statOrUndefined(item.path);
    if (stat !== undefined && !stat.isFile()) throw new FoundationError(`asset '${item.relative}' is not a regular file`, "io");
    const previous = stat === undefined ? undefined : await readFile(item.path, "utf8");
    if (previous !== undefined && previous !== item.change.content && !item.change.overwrite) {
      throw new FoundationError(`asset '${item.relative}' already exists with unmanaged content`, "io");
    }
    const action = previous === undefined ? "create" : previous === item.change.content ? "unchanged" : "update";
    return { ...item, previous, action } as const;
  }));
  const actions = states.map(({ relative: path, action }) => ({ path, action }));
  if (dryRun || states.every((state) => state.action === "unchanged")) return actions;

  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const staged: { target: string; temporary: string; backup?: string; previous?: string }[] = [];
  try {
    for (const state of states.filter((item) => item.action !== "unchanged")) {
      await ensureParent(root, state.path);
      await assertNoSymlinks(root, state.path);
      const temporary = `${state.path}.skies-tmp-${token}`;
      await writeFile(temporary, state.change.content, { encoding: "utf8", flag: "wx" });
      staged.push({ target: state.path, temporary, ...(state.previous === undefined ? {} : { previous: state.previous }) });
    }
    for (const item of staged) {
      if (item.previous !== undefined) {
        item.backup = `${item.target}.skies-backup-${token}`;
        await rename(item.target, item.backup);
      }
      await rename(item.temporary, item.target);
    }
    await Promise.all(staged.filter((item) => item.backup !== undefined)
      .map((item) => rm(item.backup!, { force: true }).catch(() => undefined)));
    return actions;
  } catch (error) {
    for (const item of [...staged].reverse()) {
      await rm(item.temporary, { force: true }).catch(() => undefined);
      if (item.backup !== undefined) {
        await rm(item.target, { force: true }).catch(() => undefined);
        await rename(item.backup, item.target).catch(() => undefined);
      } else if (item.previous === undefined) {
        await rm(item.target, { force: true }).catch(() => undefined);
      }
    }
    throw new FoundationError(`transactional asset write failed: ${error instanceof Error ? error.message : String(error)}`, "io");
  }
}
