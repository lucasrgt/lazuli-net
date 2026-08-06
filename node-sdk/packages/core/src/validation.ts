import { ErrorKind, type FieldError, type Result, type SkiesError } from "./result.js";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function isRequiredUuid(value: string | null | undefined): boolean {
  return value !== null
    && value !== undefined
    && UUID_PATTERN.test(value)
    && value.toLowerCase() !== NIL_UUID;
}

/**
 * Accumulates field failures so a slice can return every input problem in one result.
 * Rules stay in smart constructors and slices; this class only preserves their failures.
 */
export class Validation {
  readonly #fields: FieldError[] = [];

  /** Records a field failure when `ok` is false and returns this accumulator. */
  check(ok: boolean, field: string, code: string, message: string): this {
    if (!ok) this.#fields.push({ field, code, message });
    return this;
  }

  /** Records a field failure directly and returns this accumulator. */
  add(field: string, code: string, message: string): this {
    this.#fields.push({ field, code, message });
    return this;
  }

  /**
   * Folds a smart-constructor result into this accumulator. Nested field failures retain
   * their existing paths and codes rather than being flattened into the envelope code.
   */
  collect<T>(field: string, result: Result<T>): this {
    if (result.ok) return this;

    if (result.error.fields !== undefined && result.error.fields.length > 0) {
      this.#fields.push(...result.error.fields);
    } else {
      this.#fields.push({
        field,
        code: result.error.code,
        message: result.error.message,
      });
    }
    return this;
  }

  /** Records `is required` unless the value is a non-nil UUID. */
  require(value: string | null | undefined, field: string, code: string): this {
    return this.check(isRequiredUuid(value), field, code, "is required");
  }

  /** Records `must not be blank` for null, empty, or whitespace-only text. */
  notBlank(value: string | null | undefined, field: string, code: string): this {
    return this.check(value !== null && value !== undefined && value.trim().length > 0,
      field, code, "must not be blank");
  }

  /** Records a failure when a number is outside the inclusive `[min, max]` interval. */
  inRange(value: number, min: number, max: number, field: string, code: string): this;
  /** Records a failure when a bigint is outside the inclusive `[min, max]` interval. */
  inRange(value: bigint, min: bigint, max: bigint, field: string, code: string): this;
  inRange(
    value: number | bigint,
    min: number | bigint,
    max: number | bigint,
    field: string,
    code: string,
  ): this {
    return this.check(value >= min && value <= max, field, code,
      `must be between ${String(min)} and ${String(max)}`);
  }

  /** Whether at least one field failure has been recorded. */
  get failed(): boolean {
    return this.#fields.length > 0;
  }

  /** Builds one validation error carrying a snapshot of all recorded field failures. */
  toError(): SkiesError {
    return {
      kind: ErrorKind.Validation,
      code: "validation.failed",
      message: "Validation failed",
      fields: [...this.#fields],
    };
  }
}
