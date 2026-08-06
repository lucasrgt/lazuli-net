/** The closed failure catalog shared by every Skies HTTP adapter. */
export const ErrorKind = {
  Validation: "Validation",
  Unauthorized: "Unauthorized",
  Forbidden: "Forbidden",
  NotFound: "NotFound",
  Conflict: "Conflict",
  BusinessRule: "BusinessRule",
  RateLimit: "RateLimit",
  Internal: "Internal",
  Unavailable: "Unavailable",
} as const;

/** A failure category with one canonical HTTP status at the transport boundary. */
export type ErrorKind = (typeof ErrorKind)[keyof typeof ErrorKind];

/** A validation failure attached to one input field. */
export interface FieldError {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

/** A domain failure returned by a handler instead of thrown. */
export interface SkiesError {
  readonly kind: ErrorKind;
  readonly code: string;
  readonly message: string;
  readonly fields?: readonly FieldError[];
}

/** The outcome of a slice handler, discriminated without exceptions or framework types. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: SkiesError };

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail<T = never>(error: SkiesError): Result<T> {
  return { ok: false, error };
}

/** Constructors for successful and expected failed outcomes. */
export const Result = { ok, fail } as const;

function error(kind: ErrorKind, code: string, message: string): SkiesError {
  return { kind, code, message };
}

function validation(code: string, message: string): SkiesError;
function validation(fields: readonly FieldError[]): SkiesError;
function validation(codeOrFields: string | readonly FieldError[], message?: string): SkiesError {
  if (typeof codeOrFields === "string") {
    return error(ErrorKind.Validation, codeOrFields, message ?? "Validation failed");
  }

  return {
    kind: ErrorKind.Validation,
    code: "validation.failed",
    message: "Validation failed",
    fields: codeOrFields,
  };
}

/** Canonical expected-error factories. Messages are developer hints; clients localize from codes. */
export const Errors = {
  validation,
  unauthorized: (code: string, message: string) => error(ErrorKind.Unauthorized, code, message),
  forbidden: (code: string, message: string) => error(ErrorKind.Forbidden, code, message),
  notFound: (code: string, message: string) => error(ErrorKind.NotFound, code, message),
  conflict: (code: string, message: string) => error(ErrorKind.Conflict, code, message),
  businessRule: (code: string, message: string) => error(ErrorKind.BusinessRule, code, message),
  rateLimit: (code: string, message: string) => error(ErrorKind.RateLimit, code, message),
  internal: (code: string, message: string) => error(ErrorKind.Internal, code, message),
  unavailable: (code: string, message: string) => error(ErrorKind.Unavailable, code, message),
} as const;
