export interface AuditedRawSql<T> {
  readonly reason: string;
  readonly owner: string;
  execute(signal?: AbortSignal): Promise<T>;
}

/** Make exceptional raw SQL ownership and rationale reviewable instead of hiding a tagged template in a slice. */
export function defineRawSql<T>(options: AuditedRawSql<T>): AuditedRawSql<T> {
  if (!/^[a-z][a-z0-9._-]*$/u.test(options.owner)) throw new TypeError("raw SQL owner must be a stable lowercase identifier");
  if (options.reason.trim().length < 12) throw new TypeError("raw SQL reason must explain why the Drizzle builder is insufficient");
  if (typeof options.execute !== "function") throw new TypeError("raw SQL execute callback is required");
  return Object.freeze({ owner: options.owner, reason: options.reason, execute: options.execute });
}
