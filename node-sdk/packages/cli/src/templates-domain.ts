export function errorCodeSource(
  moduleName: string,
  member: string,
  code: string,
  factoryName?: string,
): string {
  const factory = factoryName === undefined ? "" : `
export function ${factoryName}(message: string): SkiesError {
  return Errors.businessRule(${moduleName}ErrorCodes.${member}, message);
}
`;
  return `${factoryName === undefined ? "" : 'import { Errors, type SkiesError } from "@skiesjs/core";\n'}import { defineErrorCodes } from "@skiesjs/openapi";

export const ${moduleName}ErrorCodes = defineErrorCodes({
  ${member}: ${JSON.stringify(code)},
});
${factory}`;
}

export function valueObjectSource(name: string, valueName: string, fileBase: string): string {
  return `import { Errors, Result, scalarCodec, type Result as Outcome } from "@skiesjs/core";
import { scalarSchema } from "@skiesjs/openapi";
import { ${name}ErrorCodes } from "./${fileBase}.errors.js";

export class ${name} {
  private constructor(public readonly value: string) {}

  static from(value: string): Outcome<${name}> {
    const normalized = value.trim();
    return normalized.length === 0
      ? Result.fail(Errors.validation(${name}ErrorCodes.invalid, ${JSON.stringify(`${name} must not be blank`)}))
      : Result.ok(new ${name}(normalized));
  }
}

export const ${valueName}Codec = scalarCodec<${name}, string>({
  primitive: { type: "string" },
  encode: (value) => value.value,
  decode: ${name}.from,
});

export const ${valueName}Schema = scalarSchema(${valueName}Codec);
`;
}

export function valueObjectTestSource(name: string, valueName: string, fileBase: string, invalidCode: string): string {
  return `import { describe, expect } from "vitest";
import { unit } from "@skiesjs/testing";
import { ${valueName}Codec, ${valueName}Schema, ${name} } from "./${fileBase}.js";

describe("${name}", () => {
  unit("constructs, encodes, and decodes through the same rules", () => {
    const result = ${name}.from("  example  ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(${valueName}Codec.encode(result.value)).toBe("example");
    expect(${valueName}Schema.safeParse("example").success).toBe(true);
  });

  unit("rejects a blank primitive with its registered code", () => {
    const result = ${name}.from("   ");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(${JSON.stringify(invalidCode)});
  });
});
`;
}

export function pageSource(name: string, valueName: string): string {
  return `import { mapPage, type Page } from "@skiesjs/core";
import { z } from "zod";

export interface ${name}PageItem {
  readonly id: string;
}

export type ${name}Page = Page<${name}PageItem>;

const itemSchema = z.object({ id: z.string() });

export const ${valueName}PageSchema = z.object({
  items: z.array(itemSchema),
  totalCount: z.number().int().nonnegative(),
  pageNumber: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export function to${name}Page(page: Page<${name}PageItem>): ${name}Page {
  return mapPage(page, (item) => ({ id: item.id }));
}
`;
}

export function pageTestSource(name: string, valueName: string, fileBase: string): string {
  return `import { describe, expect } from "vitest";
import { unit } from "@skiesjs/testing";
import { ${valueName}PageSchema, to${name}Page } from "./${fileBase}.page.js";

describe("${name}Page", () => {
  unit("projects items without losing effective paging metadata", () => {
    const page = to${name}Page({
      items: [{ id: "one" }],
      totalCount: 3,
      pageNumber: 2,
      pageSize: 1,
    });

    expect(page).toEqual({ items: [{ id: "one" }], totalCount: 3, pageNumber: 2, pageSize: 1 });
    expect(${valueName}PageSchema.safeParse(page).success).toBe(true);
  });
});
`;
}

export function storageSource(directory: string, baseUrl: string, route: string): string {
  return `import type { Express } from "express";
import { LocalFileStorage } from "@skiesjs/storage";
import { mapLocalFiles } from "@skiesjs/storage-express";

export interface StorageConfig {
  readonly rootDirectory: string;
  readonly baseUrl: string;
  readonly routePrefix: string;
}

export interface StorageWiring {
  readonly files: LocalFileStorage;
  readonly map: (app: Express) => void;
}

export const defaultStorageConfig: StorageConfig = {
  rootDirectory: ${JSON.stringify(directory)},
  baseUrl: ${JSON.stringify(baseUrl)},
  routePrefix: ${JSON.stringify(route)},
};

export function createStorage(config: StorageConfig = defaultStorageConfig): StorageWiring {
  const files = new LocalFileStorage(config.rootDirectory, config.baseUrl);
  return {
    files,
    map: (app) => {
      mapLocalFiles(app, files, { routePrefix: config.routePrefix });
    },
  };
}
`;
}

export function storageTestSource(): string {
  return `import { describe, expect } from "vitest";
import { unit } from "@skiesjs/testing";
import { createStorage } from "./storage.js";

describe("storage wiring", () => {
  unit("uses the explicit local URL convention", async () => {
    const storage = createStorage({
      rootDirectory: ".data/test-files",
      baseUrl: "http://localhost:3000/files",
      routePrefix: "/files",
    });

    await expect(storage.files.getUrl("avatars/example.png", 60_000)).resolves.toBe(
      "http://localhost:3000/files/avatars/example.png",
    );
  });
});
`;
}

export function authSource(issuer: string, audience: string): string {
  return `import type { RequestHandler } from "express";
import { AccessTokens } from "@skiesjs/auth";
import { requireJwt } from "@skiesjs/auth-express";

export interface AuthConfig {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
}

export interface AuthWiring {
  readonly accessTokens: AccessTokens;
  readonly authorize: RequestHandler;
}

export const authDefaults = {
  issuer: ${JSON.stringify(issuer)},
  audience: ${JSON.stringify(audience)},
} as const;

export function createAuth(config: AuthConfig): AuthWiring {
  const accessTokens = new AccessTokens(config.secret, config.issuer, config.audience);
  return { accessTokens, authorize: requireJwt(accessTokens) };
}
`;
}

export function authTestSource(): string {
  return `import { describe, expect } from "vitest";
import { unit } from "@skiesjs/testing";
import { AccessTokens } from "@skiesjs/auth";
import { authDefaults, createAuth } from "./auth.js";

describe("auth wiring", () => {
  unit("constructs one token boundary and its visible middleware", () => {
    const auth = createAuth({ secret: "development-only-secret", ...authDefaults });

    expect(auth.accessTokens).toBeInstanceOf(AccessTokens);
    expect(auth.authorize).toBeTypeOf("function");
  });
});
`;
}
