import { ErrorKind } from "@skiesjs/core";
import { toJSONSchema, type ZodType } from "zod";
import type { OpenApiRegistry } from "./registry.js";
import type { ContractRequest, EndpointContract, HttpMethod } from "./types.js";

/** Select either the complete service surface or only operations safe for an application client. */
export type OpenApiAudience = "all" | "app-client";

/** Options that select the projection emitted from one explicit registry. */
export interface OpenApiDocumentOptions {
  readonly audience?: OpenApiAudience;
}

/** A JSON-compatible OpenAPI 3.1 document. */
export interface OpenApiDocument {
  readonly openapi: "3.1.0";
  readonly jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema";
  readonly info: Readonly<Record<string, string>>;
  readonly paths: Readonly<Record<string, unknown>>;
  readonly components: Readonly<Record<string, unknown>>;
}

type JsonObject = Record<string, unknown>;
type SchemaPart = keyof ContractRequest;

const parts: readonly SchemaPart[] = ["body", "headers", "params", "query"];
const errorResponses = [
  ["400", "Validation"],
  ["401", "Unauthorized"],
  ["403", "Forbidden"],
  ["404", "Not found"],
  ["409", "Conflict"],
  ["422", "Business rule"],
  ["429", "Rate limit"],
  ["500", "Internal"],
  ["503", "Unavailable"],
] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedRecord<Value>(entries: Iterable<readonly [string, Value]>): Record<string, Value> {
  return Object.fromEntries([...entries].sort(([left], [right]) => compareText(left, right)));
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function componentId(contract: EndpointContract, part: SchemaPart | "output"): string {
  return `${contract.operationId}${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`;
}

function pointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function componentReference(id: string): JsonObject {
  return { $ref: `#/components/schemas/${pointerToken(id)}` };
}

function normalizeSchema(value: unknown, id: string, key?: string): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeSchema(item, id));
    return key === "required" ? [...normalized].sort((left, right) => compareText(String(left), String(right))) : normalized;
  }
  if (!isObject(value)) return value;

  return sortedRecord(Object.entries(value)
    .filter(([property]) => property !== "$schema")
    .map(([property, item]) => {
      if (property === "$ref" && typeof item === "string") {
        if (item === "#") return [property, `#/components/schemas/${pointerToken(id)}`] as const;
        if (item.startsWith("#/")) {
          return [property, `#/components/schemas/${pointerToken(id)}/${item.slice(2)}`] as const;
        }
      }
      return [property, normalizeSchema(item, id, property)] as const;
    }));
}

function makeSchema(schema: ZodType, id: string, io: "input" | "output"): JsonObject {
  const generated = toJSONSchema(schema, {
    cycles: "ref",
    io,
    reused: "inline",
    target: "draft-2020-12",
  });
  const normalized = normalizeSchema(generated, id);
  if (!isObject(normalized)) throw new Error(`Zod did not produce an object schema for component '${id}'`);
  return normalized;
}

function componentSchemas(contracts: readonly EndpointContract[], errorCodes: readonly string[]): JsonObject {
  const schemas = new Map<string, JsonObject>();
  schemas.set("FieldError", {
    type: "object",
    additionalProperties: false,
    properties: {
      code: { type: "string" },
      field: { type: "string" },
      message: { type: "string" },
    },
    required: ["code", "field", "message"],
  });
  const codeSchema: JsonObject = errorCodes.length === 0
    ? { type: "string" }
    : { type: "string", enum: [...errorCodes] };
  schemas.set("ErrorBody", {
    type: "object",
    additionalProperties: false,
    properties: {
      code: codeSchema,
      error: { type: "string", enum: Object.values(ErrorKind) },
      fields: {
        anyOf: [
          { type: "array", items: componentReference("FieldError") },
          { type: "null" },
        ],
      },
      message: { type: "string" },
    },
    required: ["error", "code", "message", "fields"],
  });

  for (const contract of contracts) {
    for (const part of parts) {
      const schema = contract.request[part];
      if (schema !== undefined) schemas.set(componentId(contract, part), makeSchema(schema, componentId(contract, part), "input"));
    }
    const outputId = componentId(contract, "output");
    // A Zod codec's input is the JSON wire value; its output is the handler's decoded domain value.
    schemas.set(outputId, makeSchema(contract.success.output, outputId, "input"));
  }
  return sortedRecord(schemas);
}

function requiredNames(schema: JsonObject): ReadonlySet<string> {
  return new Set(Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === "string") : []);
}

function parameterProperties(contract: EndpointContract, part: "headers" | "params" | "query", schemas: JsonObject): JsonObject {
  const schemaId = componentId(contract, part);
  const schema = schemas[schemaId];
  if (!isObject(schema) || schema.type !== "object" || !isObject(schema.properties)) {
    throw new Error(`${contract.operationId} request.${part} must render as a Zod object schema`);
  }
  return schema;
}

function parameters(contract: EndpointContract, schemas: JsonObject): readonly JsonObject[] {
  const result: JsonObject[] = [];
  const pathNames = [...contract.path.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1] ?? "").sort(compareText);

  for (const part of ["params", "query", "headers"] as const) {
    if (contract.request[part] === undefined) {
      if (part === "params" && pathNames.length > 0) {
        throw new Error(`${contract.operationId} path parameters require a request.params schema`);
      }
      continue;
    }
    const schema = parameterProperties(contract, part, schemas);
    const required = requiredNames(schema);
    const properties = schema.properties as JsonObject;
    const names = Object.keys(properties).sort(compareText);
    if (part === "params") {
      if (names.join("\0") !== pathNames.join("\0")) {
        throw new Error(`${contract.operationId} request.params must exactly match {parameters} in ${contract.path}`);
      }
      const optional = names.find((name) => !required.has(name));
      if (optional !== undefined) throw new Error(`${contract.operationId} path parameter '${optional}' must be required`);
    }
    for (const name of names) {
      const parameter: JsonObject = {
        name,
        in: part === "params" ? "path" : part === "headers" ? "header" : "query",
        required: part === "params" || required.has(name),
        schema: properties[name],
      };
      if (part === "query") {
        parameter.style = "form";
        parameter.explode = true;
      }
      result.push(parameter);
    }
  }
  return result;
}

function successResponse(contract: EndpointContract): JsonObject {
  const response: JsonObject = { description: "Success" };
  if (contract.success.status !== 204) {
    response.content = {
      "application/json": { schema: componentReference(componentId(contract, "output")) },
    };
  }
  return response;
}

function responses(contract: EndpointContract): JsonObject {
  const entries: [string, JsonObject][] = [[String(contract.success.status), successResponse(contract)]];
  for (const [status, description] of errorResponses) {
    entries.push([status, {
      description,
      content: { "application/json": { schema: componentReference("ErrorBody") } },
    }]);
  }
  return sortedRecord(entries);
}

function operation(contract: EndpointContract, schemas: JsonObject): JsonObject {
  const value: JsonObject = {
    operationId: contract.operationId,
    security: contract.auth === "required" ? [{ bearerAuth: [] }] : [],
    responses: responses(contract),
    "x-skies-app-client-excluded": contract.kind !== "app",
    "x-skies-auth-posture": contract.auth,
    "x-skies-endpoint-kind": contract.kind,
  };
  const operationParameters = parameters(contract, schemas);
  if (operationParameters.length > 0) value.parameters = operationParameters;
  if (contract.request.body !== undefined) {
    value.requestBody = {
      required: !contract.request.body.safeParse(undefined).success,
      content: { "application/json": { schema: componentReference(componentId(contract, "body")) } },
    };
  }
  if (contract.summary !== undefined) value.summary = contract.summary;
  if (contract.description !== undefined) value.description = contract.description;
  if (contract.tags !== undefined) value.tags = [...new Set(contract.tags)].sort(compareText);
  return value;
}

function documentPaths(contracts: readonly EndpointContract[], schemas: JsonObject): JsonObject {
  const paths = new Map<string, Map<HttpMethod, JsonObject>>();
  for (const contract of contracts) {
    const methods = paths.get(contract.path) ?? new Map<HttpMethod, JsonObject>();
    methods.set(contract.method, operation(contract, schemas));
    paths.set(contract.path, methods);
  }
  return sortedRecord([...paths].map(([path, methods]) => [path, sortedRecord(methods)] as const));
}

/**
 * Project a registry to deterministic OpenAPI 3.1 JSON. Dynamic maps are sorted, all nine canonical `ErrorBody`
 * responses are present, and the app-client projection physically excludes asset, webhook, and internal routes.
 */
export function createOpenApiDocument(
  registry: OpenApiRegistry,
  options: OpenApiDocumentOptions = {},
): OpenApiDocument {
  const audience = options.audience ?? "all";
  const contracts = registry.contracts()
    .filter((contract) => audience === "all" || contract.kind === "app")
    .sort((left, right) => compareText(left.operationId, right.operationId));
  const schemas = componentSchemas(contracts, registry.errorCodes());
  const info = registry.info.description === undefined
    ? { title: registry.info.title, version: registry.info.version }
    : { title: registry.info.title, version: registry.info.version, description: registry.info.description };

  return {
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info,
    paths: documentPaths(contracts, schemas),
    components: {
      schemas,
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
  };
}
