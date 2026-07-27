import { useCallback, useEffect, useRef, useState } from "react";

/** Optional controlled page binding, for example a router-backed `?page=` value. */
export interface PagerPageControl {
  page: number;
  setPage: (page: number) => void;
}

export interface PagerOptions {
  /** Debounce for the search term, in ms. Default 300. */
  debounceMs?: number;
  /** Start with a term already applied. */
  initialQ?: string;
  /** Initial rows per page. Omit when the endpoint has no configurable page size. */
  initialPageSize?: number;
  /** External page owner. When omitted, the hook owns page state internally. */
  pageControl?: PagerPageControl | null;
}

export interface Pager {
  /** 1-based — the generated hook's `page` param. */
  page: number;
  /** Rows per page when configured. */
  pageSize: number | undefined;
  /** Switch the page size and rewind to page 1. */
  setPageSize: (pageSize: number) => void;
  /** The live input value the search field binds. */
  q: string;
  setQ: (q: string) => void;
  /** The settled (debounced, trimmed) term — the generated hook's `q` param. */
  debouncedQ: string;
  /** Advance one page, clamped when `pageCount` is known. */
  next: (pageCount?: number) => void;
  /** Back one page, never below 1. */
  prev: () => void;
  /** Jump to a page, clamped when `pageCount` is known. */
  goTo: (page: number, pageCount?: number) => void;
  /** Back to page 1, preserving the term. */
  reset: () => void;
}

export function usePager(options?: PagerOptions): Pager {
  const debounceMs = options?.debounceMs ?? 300;
  const controlRef = useRef(options?.pageControl);
  controlRef.current = options?.pageControl;

  const [q, setQ] = useState(options?.initialQ ?? "");
  const [server, setServer] = useState(() => ({
    page: 1,
    q: (options?.initialQ ?? "").trim(),
    pageSize: options?.initialPageSize,
  }));
  const page = options?.pageControl?.page ?? server.page;

  const commitPage = useCallback((next: number) => {
    const control = controlRef.current;
    if (control) control.setPage(next);
    else setServer((state) => (state.page === next ? state : { ...state, page: next }));
  }, []);

  const settledQRef = useRef(server.q);
  useEffect(() => {
    const handle = setTimeout(() => {
      const settled = q.trim();
      if (settled === settledQRef.current) return;
      settledQRef.current = settled;
      setServer((state) => ({ ...state, q: settled }));
      commitPage(1);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [q, debounceMs, commitPage]);

  return {
    page,
    pageSize: server.pageSize,
    setPageSize: (pageSize) => {
      setServer((state) => (state.pageSize === pageSize ? state : { ...state, pageSize }));
      commitPage(1);
    },
    q,
    setQ,
    debouncedQ: server.q,
    next: (pageCount) =>
      commitPage(pageCount === undefined ? page + 1 : Math.max(1, Math.min(pageCount, page + 1))),
    prev: () => commitPage(Math.max(1, page - 1)),
    goTo: (target, pageCount) =>
      commitPage(pageCount === undefined ? Math.max(1, target) : Math.max(1, Math.min(pageCount, target))),
    reset: () => commitPage(1),
  };
}
