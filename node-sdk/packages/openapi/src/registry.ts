import type { ContractRequest, EndpointContract, ErrorCodeRegistry } from "./types.js";
import type { ZodType } from "zod";

/** The title and semantic version emitted in an OpenAPI document. */
export interface OpenApiInfo {
  readonly title: string;
  readonly version: string;
  readonly description?: string;
}

/**
 * Explicit metadata inventory shared by route mapping and document generation. Registration is synchronous so path,
 * operation-ID, and schema-name collisions fail during composition rather than after a service starts.
 */
export class OpenApiRegistry {
  readonly info: OpenApiInfo;
  readonly #contracts: EndpointContract<ContractRequest, ZodType>[] = [];
  readonly #errorRegistries: ErrorCodeRegistry[] = [];
  readonly #routes = new Set<string>();
  readonly #operationIds = new Set<string>();
  readonly #schemaIds = new Set(["ErrorBody", "FieldError"]);

  /** Create an empty inventory. Routes and error registries are added explicitly by the composition root. */
  constructor(info: OpenApiInfo) {
    if (info.title.trim().length === 0) throw new Error("OpenAPI title must not be blank");
    if (info.version.trim().length === 0) throw new Error("OpenAPI version must not be blank");
    this.info = info.description === undefined
      ? Object.freeze({ title: info.title, version: info.version })
      : Object.freeze({ title: info.title, version: info.version, description: info.description });
  }

  /** Register one contract, rejecting ambiguous route or operation identities. */
  registerContract(contract: EndpointContract): void {
    const routeKey = `${contract.method.toUpperCase()} ${contract.path}`;
    if (this.#routes.has(routeKey)) throw new Error(`HTTP contract collision: ${routeKey}`);
    if (this.#operationIds.has(contract.operationId)) {
      throw new Error(`OpenAPI operationId collision: ${contract.operationId}`);
    }
    const schemaIds = ["body", "headers", "params", "query"]
      .filter((part) => contract.request[part as keyof ContractRequest] !== undefined)
      .map((part) => `${contract.operationId}${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`);
    schemaIds.push(`${contract.operationId}Output`);
    const collision = schemaIds.find((id) => this.#schemaIds.has(id));
    if (collision !== undefined) throw new Error(`OpenAPI schema collision: ${collision}`);

    this.#routes.add(routeKey);
    this.#operationIds.add(contract.operationId);
    for (const id of schemaIds) this.#schemaIds.add(id);
    this.#contracts.push(contract);
  }

  /**
   * Add a live error-code registry. Documents read registered values when generated, so registries added after route
   * composition are present the next time `serveOpenApi` responds without a discovery scan or cached snapshot.
   */
  registerErrorCodes(codes: ErrorCodeRegistry): void {
    this.#errorRegistries.push(codes);
  }

  /** Return a defensive view of explicitly registered endpoint contracts. */
  contracts(): readonly EndpointContract[] {
    return [...this.#contracts];
  }

  /** Return the sorted, distinct union used by `ErrorBody.code`. */
  errorCodes(): readonly string[] {
    return [...new Set(this.#errorRegistries.flatMap((registry) => Object.values(registry)))].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0);
  }
}

/** Create the explicit registry passed to both `mapSlice` and `serveOpenApi`. */
export function createOpenApiRegistry(info: OpenApiInfo): OpenApiRegistry {
  return new OpenApiRegistry(info);
}
