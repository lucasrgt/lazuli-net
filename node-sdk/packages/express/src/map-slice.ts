import type { Request, RequestHandler, Response, Router } from "express";
import { Errors, Result, type FieldError } from "@skiesjs/core";
import { encodeContractOutput } from "@skiesjs/openapi";
import type {
  ContractOutput,
  ContractRequest,
  EndpointContract,
  OpenApiRegistry,
  ValidatedRequest,
} from "@skiesjs/openapi";
import { endpoint } from "./http.js";

type RequestPart = keyof ContractRequest;

/**
 * The visible seam between parsed transport values and an HTTP-agnostic slice handler. `toInput` deliberately stays
 * in application code so field renames, composition, and defaults are reviewable rather than injected or generated.
 */
/** Per-request transport context available only at the explicit map boundary. */
export interface SliceContext {
  readonly request: Request;
  readonly response: Response;
}

export interface SliceMapping<Contract extends EndpointContract, Input> {
  /** Required-auth contracts must supply the real Express authentication/authorization middleware explicitly. */
  readonly authorize?: RequestHandler;
  /** Additional visible route middleware, applied after authorization and before request validation. */
  readonly middleware?: readonly RequestHandler[];
  readonly toInput: (request: ValidatedRequest<Contract>) => Input;
  readonly handle: (input: Input, context: SliceContext) =>
    | Result<ContractOutput<Contract>>
    | Promise<Result<ContractOutput<Contract>>>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function valueFor(request: Request, part: RequestPart): unknown {
  switch (part) {
    case "body": return request.body;
    case "headers": return request.headers;
    case "params": return request.params;
    case "query": return request.query;
  }
}

function fieldError(part: RequestPart, issue: {
  readonly code: string;
  readonly message: string;
  readonly path: readonly PropertyKey[];
  readonly params?: Readonly<Record<string, unknown>> | undefined;
}): FieldError {
  const suffix = issue.path.map(String).join(".");
  return {
    field: suffix.length === 0 ? part : `${part}.${suffix}`,
    code: typeof issue.params?.["skiesCode"] === "string"
      ? issue.params["skiesCode"]
      : `validation.${issue.code}`,
    message: issue.message,
  };
}

function validateRequest<Contract extends EndpointContract>(
  contract: Contract,
  request: Request,
): Result<ValidatedRequest<Contract>> {
  const parsed: Partial<Record<RequestPart, unknown>> = {};
  const fields: FieldError[] = [];
  for (const part of ["body", "query", "params", "headers"] as const) {
    const schema = contract.request[part];
    if (schema === undefined) {
      parsed[part] = undefined;
      continue;
    }
    const result = schema.safeParse(valueFor(request, part));
    if (result.success) parsed[part] = result.data;
    else fields.push(...result.error.issues.map((issue) => fieldError(part, issue)));
  }
  if (fields.length > 0) {
    fields.sort((left, right) =>
      compareText(left.field, right.field) || compareText(left.code, right.code) || compareText(left.message, right.message));
    return Result.fail(Errors.validation(fields));
  }
  return Result.ok(parsed as ValidatedRequest<Contract>);
}

function expressPath(path: string): string {
  return path.replace(/\{([^{}]+)\}/g, ":$1");
}

/**
 * Register one contract-backed Express route. Request parts are validated independently, Zod issues become the
 * canonical validation envelope, and successful or expected failed results use the existing `endpoint` mapping.
 */
export function mapSlice<Contract extends EndpointContract, Input>(
  router: Router,
  registry: OpenApiRegistry,
  contract: Contract,
  mapping: SliceMapping<Contract, Input>,
): void {
  if (contract.auth === "required" && mapping.authorize === undefined) {
    throw new Error(`${contract.operationId} requires explicit authorize middleware`);
  }
  registry.registerContract(contract);
  const handler = endpoint<unknown>(async (request, response) => {
    const validated = validateRequest(contract, request);
    if (!validated.ok) return Result.fail(validated.error);
    const result = await mapping.handle(mapping.toInput(validated.value), { request, response });
    return result.ok
      ? Result.ok(encodeContractOutput(contract, result.value))
      : Result.fail(result.error);
  }, { successStatus: contract.success.status });
  const register = router[contract.method] as (path: string, ...handlers: RequestHandler[]) => Router;
  const routeHandlers = [
    ...(mapping.authorize === undefined ? [] : [mapping.authorize]),
    ...(mapping.middleware ?? []),
    handler,
  ];
  register.call(router, expressPath(contract.path), ...routeHandlers);
}
