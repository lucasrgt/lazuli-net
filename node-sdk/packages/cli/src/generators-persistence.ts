import { readFile } from "node:fs/promises";
import path from "node:path";
import { apply, type FilePlan, type FilePlanFile } from "./file-plan.js";
import { requireIdentifier, sourceRoot, toCamel, toKebab, type GeneratorOptions } from "./naming.js";
import { registerGeneratedProof } from "./proof-registry.js";
import { registerErrorRegistry, registerSlice, supportsSliceRegistration } from "./slice-registry.js";
import { crudSliceSource, crudSliceTestSource, crudWriteJourneySource } from "./templates-crud.js";
import {
  crudErrorSource,
  crudQuerySource,
  entityMigrationSource,
  entitySource,
  entityTestSource,
  uuidValueSource,
} from "./templates-persistence.js";

export interface GenerateEntityOptions extends GeneratorOptions {
  readonly module: string;
  readonly name: string;
}

export type GenerateCrudOptions = GenerateEntityOptions;

interface EntityShape {
  readonly modulePath: string;
  readonly fileBase: string;
  readonly variable: string;
  readonly plural: string;
  readonly table: string;
  readonly directory: string;
}

function pluralize(value: string): string {
  if (/[^aeiou]y$/u.test(value)) return `${value.slice(0, -1)}ies`;
  if (/(?:s|x|z|ch|sh)$/u.test(value)) return `${value}es`;
  return `${value}s`;
}

function shape(options: GenerateEntityOptions): EntityShape {
  requireIdentifier(options.module, "module");
  requireIdentifier(options.name, "entity name");
  const roots = sourceRoot(options);
  const modulePath = toKebab(options.module);
  const fileBase = toKebab(options.name);
  const plural = pluralize(fileBase);
  return {
    modulePath,
    fileBase,
    variable: toCamel(options.name),
    plural,
    table: `${modulePath}_${plural}`.replaceAll("-", "_"),
    directory: path.join(roots.source, "modules", modulePath),
  };
}

function entityFiles(options: GenerateEntityOptions, entity: EntityShape): readonly FilePlanFile[] {
  const entities = path.join(entity.directory, "entities");
  return [
    {
      target: path.join(entities, `${entity.fileBase}.entity.ts`),
      contents: entitySource(options.name, entity.variable, entity.table),
    },
    {
      target: path.join(entities, `${entity.fileBase}.entity.test.ts`),
      contents: entityTestSource(options.name, entity.variable, entity.fileBase, entity.table),
    },
    {
      target: path.join(entity.directory, "migrations", `0001-create-${entity.plural}.sql`),
      contents: entityMigrationSource(entity.table),
    },
  ];
}

async function optionalBytes(target: string): Promise<Buffer | undefined> {
  return readFile(target).catch((caught: unknown) => {
    if ((caught as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw caught;
  });
}

function utf8(bytes: Buffer, target: string): string {
  const source = bytes.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(bytes)) throw new Error(`${target} is not valid UTF-8`);
  return source;
}


function wireCrudDependency(source: string, options: GenerateCrudOptions, entity: EntityShape): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(newline);
  const mapIndex = lines.findIndex((line) => line.startsWith("export function map("));
  if (mapIndex === -1) throw new Error("module has no explicit map function for CRUD dependencies");
  const importIndexes = lines.flatMap((line, index) => line.startsWith("import ") ? [index] : []);
  const dependenciesName = `${options.module}Dependencies`;
  const queriesName = `${options.name}Queries`;
  const member = `${entity.variable}Queries`;
  lines.splice(
    importIndexes.at(-1)! + 1,
    0,
    `import { unconfigured${options.name}Queries, type ${queriesName} } from "./queries/${entity.fileBase}.queries.js";`,
  );
  let currentMapIndex = lines.findIndex((line) => line.startsWith("export function map("));
  const interfaceIndex = lines.findIndex((line) => line === `export interface ${dependenciesName} {`);
  if (interfaceIndex === -1) {
    lines.splice(currentMapIndex, 0, `export interface ${dependenciesName} {`, `  readonly ${member}?: ${queriesName};`, "}", "");
    currentMapIndex += 4;
    lines[currentMapIndex] = lines[currentMapIndex]!.replace(
      /\): void \{$/u,
      `, dependencies: ${dependenciesName} = {}): void {`,
    );
  } else {
    const close = lines.findIndex((line, index) => index > interfaceIndex && line === "}");
    if (close === -1) throw new Error(`module ${dependenciesName} interface is malformed`);
    lines.splice(close, 0, `  readonly ${member}?: ${queriesName};`);
  }
  for (const kind of ["create", "get", "list", "update", "delete"] as const) {
    const alias = `${kind[0]!.toUpperCase()}${kind.slice(1)}${options.name}`;
    const index = lines.findIndex((line) => line.trimStart().startsWith(`${alias}.map(`));
    if (index === -1) throw new Error(`${alias} map call is missing from its module`);
    lines[index] = lines[index]!.replace(
      /\);$/u,
      `, dependencies.${member} ?? unconfigured${options.name}Queries);`,
    );
  }
  return lines.join(newline);
}

/** Generate one explicit Drizzle PostgreSQL table, migration, and executable schema-shape test. */
export async function generateEntity(options: GenerateEntityOptions): Promise<readonly string[]> {
  const roots = sourceRoot(options);
  const entity = shape(options);
  const plan: FilePlan = { root: roots.cwd, files: entityFiles(options, entity) };
  return apply(plan, { dryRun: options.dryRun ?? false });
}

/** Generate the complete entity-specific CRUD surface and every registration in one FilePlan transaction. */
export async function generateCrud(options: GenerateCrudOptions): Promise<readonly string[]> {
  const roots = sourceRoot(options);
  const entity = shape(options);
  const moduleFile = path.join(entity.directory, `${entity.modulePath}.module.ts`);
  const moduleBytes = await optionalBytes(moduleFile);
  if (moduleBytes === undefined) throw new Error(`${moduleFile} does not exist; generate the module first`);
  let moduleSource = utf8(moduleBytes, moduleFile);
  if (!supportsSliceRegistration(moduleSource)) {
    throw new Error(`${moduleFile} does not expose the Router/OpenAPI composition seam required by CRUD`);
  }

  const entityFile = path.join(entity.directory, "entities", `${entity.fileBase}.entity.ts`);
  const existingEntity = await optionalBytes(entityFile);
  if (existingEntity !== undefined) {
    const source = utf8(existingEntity, entityFile);
    if (!source.includes(`export const ${entity.variable}Table`)) {
      throw new Error(`${entityFile} must export ${entity.variable}Table before CRUD can use it`);
    }
  }

  const route = `/${entity.plural}`;
  const kinds = ["create", "get", "list", "update", "delete"] as const;
  const criterionFor = (kind: (typeof kinds)[number]): string =>
    `${entity.modulePath}.${entity.fileBase}.${kind}`;
  for (const kind of kinds) {
    const alias = `${kind[0]!.toUpperCase()}${kind.slice(1)}${options.name}`;
    moduleSource = registerSlice(moduleSource, alias, `./slices/${kind}-${entity.fileBase}.slice.js`);
  }
  moduleSource = registerErrorRegistry(
    moduleSource,
    `${options.name}ErrorCodes`,
    `./${entity.fileBase}.errors.js`,
  );
  moduleSource = wireCrudDependency(moduleSource, options, entity);

  const sliceDirectory = path.join(entity.directory, "slices");
  const files: FilePlanFile[] = [
    ...(existingEntity === undefined ? entityFiles(options, entity) : []),
    {
      target: path.join(entity.directory, `${entity.fileBase}.errors.ts`),
      contents: crudErrorSource(options.name, entity.variable, `${entity.modulePath}.${entity.fileBase.replaceAll("-", "_")}`),
    },
    {
      target: path.join(entity.directory, "values", `${entity.fileBase}-id.ts`),
      contents: uuidValueSource(options.name, entity.variable, entity.fileBase),
    },
    {
      target: path.join(entity.directory, "queries", `${entity.fileBase}.queries.ts`),
      contents: crudQuerySource(options.name, entity.variable, entity.fileBase),
    },
    ...kinds.map((kind): FilePlanFile => ({
      target: path.join(sliceDirectory, `${kind}-${entity.fileBase}.slice.ts`),
      contents: crudSliceSource({
        kind, name: options.name, variable: entity.variable, fileBase: entity.fileBase,
        route, criterion: criterionFor(kind),
      }),
    })),
    ...kinds.map((kind): FilePlanFile => ({
      target: path.join(sliceDirectory, `${kind}-${entity.fileBase}.slice.test.ts`),
      contents: crudSliceTestSource({ kind, name: options.name, fileBase: entity.fileBase, criterion: criterionFor(kind) }),
    })),
    ...(["create", "update", "delete"] as const).map((kind): FilePlanFile => ({
      target: path.join(sliceDirectory, `${kind}-${entity.fileBase}.slice.journey.ts`),
      contents: crudWriteJourneySource({
        kind, name: options.name, variable: entity.variable, fileBase: entity.fileBase,
        route, criterion: criterionFor(kind),
      }),
    })),
    { target: moduleFile, contents: moduleSource, expectedContents: moduleBytes },
  ];

  const manifestFile = path.join(roots.cwd, "skies.node.json");
  const manifestBytes = await optionalBytes(manifestFile);
  if (manifestBytes !== undefined) {
    const relative = (target: string): string => path.relative(roots.cwd, target).split(path.sep).join("/");
    let manifestSource = utf8(manifestBytes, manifestFile);
    for (const kind of kinds) {
      const sliceFile = path.join(sliceDirectory, `${kind}-${entity.fileBase}.slice.ts`);
      const proofFile = path.join(
        sliceDirectory,
        `${kind}-${entity.fileBase}.slice.${["create", "update", "delete"].includes(kind) ? "journey" : "test"}.ts`,
      );
      manifestSource = registerGeneratedProof(manifestSource, {
        proofId: `${entity.modulePath}-${entity.fileBase}-${kind}-${["create", "update", "delete"].includes(kind) ? "journey" : "unit"}`,
        criterionId: criterionFor(kind),
        statement: `${options.name} ${kind} preserves tenant ownership and explicit contracts.`,
        kind: ["create", "update", "delete"].includes(kind) ? "journey" : "unit",
        sourceScopes: [relative(entityFile), relative(sliceFile), relative(proofFile)],
      });
    }
    files.push({ target: manifestFile, contents: manifestSource, expectedContents: manifestBytes });
  }

  return apply({ root: roots.cwd, files }, { dryRun: options.dryRun ?? false });
}
