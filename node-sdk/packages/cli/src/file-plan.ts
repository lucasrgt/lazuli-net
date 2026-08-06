import { lstat, mkdir, readFile, realpath, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type FilePlanContents = string | Uint8Array;

/** A single atomic file-plan entry. Supplying expectedContents opts into an exact-content replacement. */
export interface FilePlanFile {
  readonly target: string;
  readonly contents: FilePlanContents;
  readonly expectedContents?: FilePlanContents;
  /** POSIX permissions for a newly staged file (for example 0o755 for a Git hook). */
  readonly mode?: number;
}

/** A transaction whose targets must all be descendants of root. */
export interface FilePlan {
  readonly root: string;
  readonly files: readonly FilePlanFile[];
}

/** The two mutating operations exposed for deterministic fault-injection tests. */
export interface FilePlanOperations {
  readonly writeFile: (target: string, contents: Uint8Array, mode?: number) => Promise<void>;
  readonly rename: (from: string, to: string) => Promise<void>;
}

export interface ApplyFilePlanOptions {
  readonly dryRun?: boolean;
  readonly operations?: Partial<FilePlanOperations>;
}

interface InspectedFile {
  readonly target: string;
  readonly contents: Uint8Array;
  readonly expectedContents?: Uint8Array;
  readonly mode?: number;
}

interface InspectedPlan {
  readonly root: string;
  readonly files: readonly InspectedFile[];
}

interface StagedFile {
  readonly file: InspectedFile;
  readonly temporary: string;
}

interface ReplacementState {
  readonly target: string;
  readonly backup: string;
  originalMoved: boolean;
  replacementInstalled: boolean;
}

const nativeOperations: FilePlanOperations = {
  writeFile: async (target, contents, mode) => writeFile(target, contents, {
    flag: "wx",
    ...(mode === undefined ? {} : { mode }),
  }),
  rename,
};

function bytes(contents: FilePlanContents): Uint8Array {
  return typeof contents === "string" ? Buffer.from(contents, "utf8") : contents;
}

function isMissing(caught: unknown): boolean {
  return (caught as NodeJS.ErrnoException).code === "ENOENT";
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (caught) {
    if (isMissing(caught)) return false;
    throw caught;
  }
}

function isContained(root: string, target: string, allowRoot = false): boolean {
  const relative = path.relative(root, target);
  if (relative === "") return allowRoot;
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function normalize(plan: FilePlan): InspectedPlan {
  const root = path.resolve(plan.root);
  const seen = new Set<string>();
  const files = plan.files.map((file): InspectedFile => {
    const target = path.resolve(root, file.target);
    if (!isContained(root, target)) throw new Error(`file plan target escapes root: ${file.target}`);
    const key = process.platform === "win32" ? target.toLowerCase() : target;
    if (seen.has(key)) throw new Error(`file plan has duplicate target: ${target}`);
    seen.add(key);
    if (file.mode !== undefined && (!Number.isSafeInteger(file.mode) || file.mode < 0 || file.mode > 0o777)) {
      throw new Error(`file plan mode must be an integer from 0 through 0o777: ${file.target}`);
    }
    const normalized: InspectedFile = {
      target,
      contents: bytes(file.contents),
      ...(file.mode === undefined ? {} : { mode: file.mode }),
    };
    if (Object.prototype.hasOwnProperty.call(file, "expectedContents")) {
      if (file.expectedContents === undefined) throw new Error(`expectedContents is undefined for ${target}`);
      return { ...normalized, expectedContents: bytes(file.expectedContents) };
    }
    return normalized;
  });
  return { root, files };
}

async function existingAncestor(target: string): Promise<string> {
  let cursor = target;
  while (true) {
    try {
      await lstat(cursor);
      return cursor;
    } catch (caught) {
      if (!isMissing(caught)) throw caught;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw caught;
      cursor = parent;
    }
  }
}

async function inspect(plan: FilePlan): Promise<InspectedPlan> {
  const normalized = normalize(plan);
  const rootInfo = await stat(normalized.root).catch((caught: unknown) => {
    if (isMissing(caught)) throw new Error(`file plan root does not exist: ${normalized.root}`);
    throw caught;
  });
  if (!rootInfo.isDirectory()) throw new Error(`file plan root is not a directory: ${normalized.root}`);
  const physicalRoot = await realpath(normalized.root);
  const problems: string[] = [];

  for (const file of normalized.files) {
    const ancestor = await existingAncestor(path.dirname(file.target));
    const physicalAncestor = await realpath(ancestor);
    if (!isContained(physicalRoot, physicalAncestor, true)) {
      problems.push(`${file.target} resolves outside root through ${ancestor}`);
      continue;
    }

    try {
      const info = await lstat(file.target);
      if (file.expectedContents === undefined) {
        problems.push(`${file.target} already exists`);
      } else if (!info.isFile() || info.isSymbolicLink()) {
        problems.push(`${file.target} is not a replaceable regular file`);
      } else {
        const current = await readFile(file.target);
        if (!Buffer.from(current).equals(Buffer.from(file.expectedContents))) {
          problems.push(`${file.target} changed before apply`);
        }
      }
    } catch (caught) {
      if (!isMissing(caught)) throw caught;
      if (file.expectedContents !== undefined) problems.push(`${file.target} does not exist for replacement`);
    }
  }

  if (problems.length > 0) throw new Error(`file plan preflight failed:\n- ${problems.join("\n- ")}`);
  return normalized;
}

/** Validate containment, uniqueness, replacements, and every create collision without writing anything. */
export async function preflight(plan: FilePlan): Promise<readonly string[]> {
  const inspected = await inspect(plan);
  return inspected.files.map((file) => file.target);
}

async function ensureDirectory(root: string, directory: string, created: string[]): Promise<void> {
  const missing: string[] = [];
  let cursor = directory;
  while (cursor !== root) {
    try {
      const info = await stat(cursor);
      if (!info.isDirectory()) throw new Error(`file plan parent is not a directory: ${cursor}`);
      break;
    } catch (caught) {
      if (!isMissing(caught)) throw caught;
      missing.push(cursor);
      cursor = path.dirname(cursor);
    }
  }
  for (const target of missing.reverse()) {
    try {
      await mkdir(target);
      created.push(target);
    } catch (caught) {
      if ((caught as NodeJS.ErrnoException).code !== "EEXIST") throw caught;
    }
  }
}

async function availableSibling(target: string, kind: "tmp" | "bak", index: number): Promise<string> {
  const directory = path.dirname(target);
  const basename = path.basename(target);
  for (let attempt = 0; ; attempt += 1) {
    const candidate = path.join(directory, `.${basename}.skies-${process.pid}-${index}-${attempt}.${kind}`);
    if (!(await exists(candidate))) return candidate;
  }
}

async function removeEmptyDirectories(created: readonly string[]): Promise<void> {
  for (const directory of [...created].reverse()) {
    try {
      await rmdir(directory);
    } catch (caught) {
      const code = (caught as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST") throw caught;
    }
  }
}

async function rollback(
  staged: readonly StagedFile[],
  createdTargets: readonly string[],
  replacements: readonly ReplacementState[],
  createdDirectories: readonly string[],
): Promise<void> {
  for (const state of [...replacements].reverse()) {
    if (await exists(state.backup)) {
      if (await exists(state.target)) await rm(state.target, { force: true });
      await rename(state.backup, state.target);
    }
  }
  for (const target of [...createdTargets].reverse()) await rm(target, { force: true });
  for (const item of staged) await rm(item.temporary, { force: true });
  for (const state of replacements) await rm(state.backup, { force: true });
  await removeEmptyDirectories(createdDirectories);
}

/** Apply a preflighted transaction. Dry runs return the same ordered targets and perform zero writes. */
export async function apply(plan: FilePlan, options: ApplyFilePlanOptions = {}): Promise<readonly string[]> {
  const inspected = await inspect(plan);
  const targets = inspected.files.map((file) => file.target);
  if (options.dryRun) return targets;

  const operations: FilePlanOperations = { ...nativeOperations, ...options.operations };
  const createdDirectories: string[] = [];
  const staged: StagedFile[] = [];
  const createdTargets: string[] = [];
  const replacements: ReplacementState[] = [];

  try {
    for (const [index, file] of inspected.files.entries()) {
      await ensureDirectory(inspected.root, path.dirname(file.target), createdDirectories);
      const temporary = await availableSibling(file.target, "tmp", index);
      staged.push({ file, temporary });
      await operations.writeFile(temporary, file.contents, file.mode);
    }

    const creates = staged.filter((item) => item.file.expectedContents === undefined);
    const updates = staged.filter((item) => item.file.expectedContents !== undefined);
    for (const item of creates) {
      if (await exists(item.file.target)) throw new Error(`${item.file.target} appeared after preflight`);
      try {
        await operations.rename(item.temporary, item.file.target);
        createdTargets.push(item.file.target);
      } catch (caught) {
        if (!(await exists(item.temporary)) && (await exists(item.file.target))) createdTargets.push(item.file.target);
        throw caught;
      }
    }

    for (const [index, item] of updates.entries()) {
      const current = await readFile(item.file.target);
      if (!Buffer.from(current).equals(Buffer.from(item.file.expectedContents!))) {
        throw new Error(`${item.file.target} changed after preflight`);
      }
      const backup = await availableSibling(item.file.target, "bak", index);
      const state: ReplacementState = {
        target: item.file.target,
        backup,
        originalMoved: false,
        replacementInstalled: false,
      };
      replacements.push(state);
      try {
        await operations.rename(item.file.target, backup);
        state.originalMoved = true;
      } catch (caught) {
        state.originalMoved = (await exists(backup)) && !(await exists(item.file.target));
        throw caught;
      }
      try {
        await operations.rename(item.temporary, item.file.target);
        state.replacementInstalled = true;
      } catch (caught) {
        state.replacementInstalled = (await exists(item.file.target)) && !(await exists(item.temporary));
        throw caught;
      }
    }

    for (const state of replacements) await rm(state.backup, { force: true });
    return targets;
  } catch (caught) {
    try {
      await rollback(staged, createdTargets, replacements, createdDirectories);
    } catch (rollbackFailure) {
      throw new AggregateError([caught, rollbackFailure], "file plan failed and rollback was incomplete");
    }
    throw caught;
  }
}
