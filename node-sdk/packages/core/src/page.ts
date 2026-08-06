/**
 * One page of a larger collection. Its numeric members are the effective server values after
 * clamping, while `totalCount` describes the whole filtered set even when `items` is empty.
 */
export interface Page<T> {
  /** Items in the source query's order, with at most `pageSize` entries. */
  readonly items: readonly T[];
  /** Size of the whole filtered set rather than the number of items on this page. */
  readonly totalCount: number;
  /** Effective 1-based page number. */
  readonly pageNumber: number;
  /** Effective page size. */
  readonly pageSize: number;
}

/**
 * Projects a page's items without making callers reconstruct paging metadata by hand.
 * Empty and past-end pages keep their totals and effective bounds unchanged.
 */
export function mapPage<T, TOutput>(
  page: Page<T>,
  selector: (item: T, index: number) => TOutput,
): Page<TOutput> {
  return {
    items: page.items.map(selector),
    totalCount: page.totalCount,
    pageNumber: page.pageNumber,
    pageSize: page.pageSize,
  };
}
