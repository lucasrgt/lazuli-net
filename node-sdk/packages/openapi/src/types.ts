import { encode, type input, type output, type ZodType } from "zod";

/** HTTP methods supported by the explicit Express adapter and OpenAPI projection. */
export type HttpMethod = "delete" | "get" | "head" | "options" | "patch" | "post" | "put";

/** A route must say whether callers authenticate; omission is intentionally not representable. */
export type AuthPosture = "anonymous" | "required";

/**
 * The audience an endpoint belongs to. Only `app` operations are eligible for generated application clients;
 * the other kinds remain visible in the complete service document.
 */
export type EndpointKind = "app" | "asset" | "webhook" | "internal";

/** The four independently validated sources from which a slice input may be assembled. */
export interface ContractRequest {
  readonly body?: ZodType;
  readonly query?: ZodType;
  readonly params?: ZodType;
  readonly headers?: ZodType;
}

/** The successful wire response declared by an endpoint. */
export interface ContractSuccess<Output extends ZodType = ZodType> {
  /** The explicit 2xx status returned by the adapter. */
  readonly status: number;
  /** The Zod schema that describes the successful JSON value. */
  readonly output: Output;
}

/**
 * Plain, framework-neutral metadata for one HTTP operation. The operation ID, auth posture, audience kind, request
 * schemas, and successful output are all explicit so documentation never depends on reflection or discovery.
 */
export interface EndpointContract<
  Request extends ContractRequest = ContractRequest,
  Output extends ZodType = ZodType,
> {
  readonly operationId: string;
  readonly method: HttpMethod;
  /** An OpenAPI path such as `/wallets/{walletId}`. */
  readonly path: string;
  readonly auth: AuthPosture;
  readonly kind: EndpointKind;
  readonly request: Request;
  readonly success: ContractSuccess<Output>;
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

/** A named, explicit registry of stable application error codes. */
export type ErrorCodeRegistry = Readonly<Record<string, string>>;

type RequestOf<Contract extends EndpointContract> =
  Contract extends EndpointContract<infer Request, ZodType> ? Request : never;

type PartOutput<Request extends ContractRequest, Key extends keyof ContractRequest> =
  Extract<Request[Key], ZodType> extends never ? undefined : output<Extract<Request[Key], ZodType>>;

/** Parsed request parts passed to a visible slice-input mapper by an HTTP adapter. */
export type ValidatedRequest<Contract extends EndpointContract> = {
  readonly body: PartOutput<RequestOf<Contract>, "body">;
  readonly query: PartOutput<RequestOf<Contract>, "query">;
  readonly params: PartOutput<RequestOf<Contract>, "params">;
  readonly headers: PartOutput<RequestOf<Contract>, "headers">;
};

/** The output value promised by a contract's successful response. */
export type ContractOutput<Contract extends EndpointContract> =
  Contract extends EndpointContract<ContractRequest, infer Output> ? output<Output> : never;

/** Encode a handler's domain output to the JSON wire value declared by its Zod schema or codec. */
export function encodeContractOutput<Contract extends EndpointContract>(
  contract: Contract,
  value: ContractOutput<Contract>,
): input<Contract["success"]["output"]> {
  return encode(contract.success.output, value) as input<Contract["success"]["output"]>;
}

/** Identity helper that preserves the exact Zod request and output types for adapters. */
export function defineContract<
  const Request extends ContractRequest,
  const Output extends ZodType,
>(contract: EndpointContract<Request, Output>): EndpointContract<Request, Output> {
  const methods: readonly HttpMethod[] = ["delete", "get", "head", "options", "patch", "post", "put"];
  const authPostures: readonly AuthPosture[] = ["anonymous", "required"];
  const endpointKinds: readonly EndpointKind[] = ["app", "asset", "webhook", "internal"];
  if (contract.operationId.trim().length === 0) throw new Error("operationId must not be blank");
  if (!methods.includes(contract.method)) throw new Error(`Unsupported HTTP method: ${String(contract.method)}`);
  if (!contract.path.startsWith("/")) throw new Error(`OpenAPI path must start with '/': ${contract.path}`);
  if (!authPostures.includes(contract.auth)) throw new Error("auth must explicitly be 'anonymous' or 'required'");
  if (!endpointKinds.includes(contract.kind)) {
    throw new Error("kind must explicitly be 'app', 'asset', 'webhook', or 'internal'");
  }
  if (typeof contract.request !== "object" || contract.request === null) {
    throw new Error("request must explicitly declare its body, query, params, and header schemas or be empty");
  }
  if (typeof contract.success !== "object" || contract.success === null) {
    throw new Error("success must explicitly declare a status and output schema");
  }
  if (!Number.isInteger(contract.success.status) || contract.success.status < 200 || contract.success.status > 299) {
    throw new Error(`Success status must be an integer from 200 through 299: ${contract.success.status}`);
  }
  for (const [part, schema] of Object.entries({ ...contract.request, output: contract.success.output })) {
    if (schema !== undefined && (typeof schema !== "object" || !("safeParse" in schema))) {
      throw new Error(`${part} must be a Zod schema`);
    }
  }
  return Object.freeze(contract);
}

/**
 * Define a registry without string widening. Values may be repeated across registries; the document publishes their
 * sorted, distinct union because the wire contract is the code value rather than its local constant name.
 */
export function defineErrorCodes<const Codes extends Record<string, string>>(codes: Codes): Readonly<Codes> {
  for (const [name, code] of Object.entries(codes)) {
    if (name.trim().length === 0) throw new Error("Error-code registry names must not be blank");
    if (code.trim().length === 0) throw new Error(`Error code '${name}' must not be blank`);
  }
  return Object.freeze({ ...codes });
}
