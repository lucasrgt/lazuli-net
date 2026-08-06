import type { Page } from "@skiesjs/core";

const policyBrand: unique symbol = Symbol("skies.drizzle.page-policy");
export type OrderDirection = "asc" | "desc";

export interface PageOrderColumn {
  readonly column: string;
  readonly direction: OrderDirection;
  /** Exactly the final order column must be a database-unique tie-breaker. */
  readonly unique?: true;
}

export interface PagePolicy {
  readonly owner: string;
  readonly filter: string;
  readonly order: readonly PageOrderColumn[];
  readonly [policyBrand]: true;
}

/** Declare the owner, filtered set, and deterministic database order once beside the Drizzle query. */
export function pagePolicy(input: {
  readonly owner: string;
  readonly filter: string;
  readonly order: readonly PageOrderColumn[];
}): PagePolicy {
  for (const [name, value] of [["owner", input.owner], ["filter", input.filter]] as const) {
    if (!/^[a-z][a-z0-9._-]*$/u.test(value)) throw new TypeError(`${name} must be a stable lowercase identifier`);
  }
  if (input.order.length === 0) throw new TypeError("order must declare at least one column");
  const seen = new Set<string>();
  const order = input.order.map((item, index) => {
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/u.test(item.column)) throw new TypeError("order columns must be stable identifiers");
    if (seen.has(item.column)) throw new TypeError(`order column '${item.column}' is duplicated`);
    seen.add(item.column);
    if (item.direction !== "asc" && item.direction !== "desc") throw new TypeError("order direction must be asc or desc");
    if (item.unique === true && index !== input.order.length - 1) {
      throw new TypeError("only the final order column may be the unique tie-breaker");
    }
    return Object.freeze({ column: item.column, direction: item.direction, ...(item.unique ? { unique: true as const } : {}) });
  });
  if (order.at(-1)?.unique !== true) throw new TypeError("the final order column must be marked as a unique tie-breaker");
  return Object.freeze({ owner: input.owner, filter: input.filter, order: Object.freeze(order), [policyBrand]: true as const });
}

export interface PageQueryContext {
  readonly policy: PagePolicy;
  readonly signal: AbortSignal | undefined;
}

/** The bounded range an ordered Drizzle selection must materialize. */
export interface OrderedPageSelection extends PageQueryContext {
  readonly offset: number;
  readonly limit: number;
}

export interface OrderedPageRequest<TEntity, TOutput> {
  readonly pageNumber: number;
  readonly pageSize: number;
  readonly maxPageSize?: number;
  readonly signal?: AbortSignal;
  /** One explicit policy object is passed by identity to count and select. */
  readonly policy: PagePolicy;
  readonly count: (context: PageQueryContext) => Promise<number>;
  readonly select: (selection: OrderedPageSelection) => Promise<readonly TEntity[]>;
  readonly project: (entity: TEntity, index: number) => TOutput;
}

/** Count and materialize one bounded, explicitly scoped and uniquely ordered Drizzle/PostgreSQL page. */
export async function toPage<TEntity, TOutput>(request: OrderedPageRequest<TEntity, TOutput>): Promise<Page<TOutput>> {
  const pageNumber = lowerBoundedInteger(request.pageNumber, 1, "pageNumber");
  const requestedSize = lowerBoundedInteger(request.pageSize, 1, "pageSize");
  const maximumSize = lowerBoundedInteger(request.maxPageSize ?? 100, 1, "maxPageSize");
  const pageSize = Math.min(requestedSize, maximumSize);
  const offset = (pageNumber - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throw new RangeError("The requested page produces an unsafe database offset.");

  request.signal?.throwIfAborted();
  const context = Object.freeze({ policy: request.policy, signal: request.signal });
  const totalCount = await request.count(context);
  request.signal?.throwIfAborted();
  if (!Number.isSafeInteger(totalCount) || totalCount < 0) throw new RangeError("count must return a non-negative safe integer.");

  const entities = await request.select({ ...context, offset, limit: pageSize });
  request.signal?.throwIfAborted();
  if (entities.length > pageSize) throw new RangeError("select returned more rows than its requested limit.");

  const items = entities.map(request.project);
  request.signal?.throwIfAborted();
  return { items, totalCount, pageNumber, pageSize };
}

function lowerBoundedInteger(value: number, minimum: number, name: string): number {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${name} must be a safe integer.`);
  return Math.max(minimum, value);
}
