// Page<T> — the spine's structural match for the backend's canonical page (Skies.Framework.Abstractions' Page<T>,
// pinned in the OpenAPI document: four members, required, plainly numeric). Structural on purpose, like
// QueryLike: the spine never imports the generated client, so any generated response carrying this shape —
// whatever slice, whatever app — is recognized as a page and the pager hooks compose with it. The numbers
// are the server's EFFECTIVE values after clamping; the contract never reports a page it did not serve.

export interface Page<T> {
  /** The items of this page, in the slice's order — at most `pageSize` of them. */
  items: readonly T[];
  /** The size of the whole filtered set, not of this page — what "21–40 de 87" derives its 87 from. */
  totalCount: number;
  /** The 1-based number of this page, as actually served. */
  pageNumber: number;
  /** The page size actually served. */
  pageSize: number;
}

/** The render facts of a page — see {@link toPageInfo}. */
export interface PageInfo {
  /** Total pages — at least 1 (an empty set is one empty page, so a clamp against it stays sane). */
  pageCount: number;
  /** 1-based index of the first item shown on this page; 0 when the page is empty. */
  from: number;
  /** 1-based index of the last item shown on this page; 0 when the page is empty. */
  to: number;
  totalCount: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * Derive what a View needs to render a numbered pager — pure, so the ViewModel computes it from the latest
 * `Page` and the View renders "{from}–{to} de {totalCount}" without arithmetic. `undefined` propagates (no
 * page yet → no info), which composes with the clamp story: `pager.next(info?.pageCount)` clamps once the
 * total is known and roams free while it is not.
 */
export function toPageInfo(page: Page<unknown>): PageInfo;
export function toPageInfo(page: Page<unknown> | undefined): PageInfo | undefined;
export function toPageInfo(page: Page<unknown> | undefined): PageInfo | undefined {
  if (page === undefined) return undefined;
  const pageSize = Math.max(1, page.pageSize);
  const pageCount = Math.max(1, Math.ceil(page.totalCount / pageSize));
  const from = page.items.length === 0 ? 0 : (page.pageNumber - 1) * pageSize + 1;
  const to = page.items.length === 0 ? 0 : from + page.items.length - 1;
  return {
    pageCount,
    from,
    to,
    totalCount: page.totalCount,
    hasPrev: page.pageNumber > 1,
    hasNext: page.pageNumber < pageCount,
  };
}
