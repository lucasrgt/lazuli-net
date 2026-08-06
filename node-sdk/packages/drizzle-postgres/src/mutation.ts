import { Errors, Result, type Result as ResultOutcome } from "@skiesjs/core";

export interface VersionedMutationExecution<T> {
  readonly affectedRows: number;
  readonly value: T;
}

/**
 * Execute an optimistic-concurrency mutation. Application Drizzle code must include `expectedVersion` in its
 * predicate and return the driver's affected-row count; zero becomes a stable conflict and fan-out fails closed.
 */
export async function executeVersionedMutation<T>(options: {
  readonly expectedVersion: number;
  readonly signal?: AbortSignal;
  readonly conflictCode: string;
  readonly conflictMessage: string;
  readonly execute: (input: { readonly expectedVersion: number; readonly signal: AbortSignal | undefined }) =>
    Promise<VersionedMutationExecution<T>>;
}): Promise<ResultOutcome<T>> {
  if (!Number.isSafeInteger(options.expectedVersion) || options.expectedVersion < 0) {
    throw new TypeError("expectedVersion must be a non-negative safe integer");
  }
  if (options.conflictCode.trim().length === 0 || options.conflictMessage.trim().length === 0) {
    throw new TypeError("conflict code and message must be nonblank");
  }
  options.signal?.throwIfAborted();
  const result = await options.execute({ expectedVersion: options.expectedVersion, signal: options.signal });
  options.signal?.throwIfAborted();
  if (!Number.isSafeInteger(result.affectedRows) || result.affectedRows < 0 || result.affectedRows > 1) {
    throw new RangeError("a versioned mutation must affect zero or one row");
  }
  return result.affectedRows === 0
    ? Result.fail(Errors.conflict(options.conflictCode, options.conflictMessage))
    : Result.ok(result.value);
}
