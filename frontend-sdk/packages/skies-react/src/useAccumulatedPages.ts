import { useState } from "react";
import type { Page } from "./page";

// The load-more fold for an accumulated list (the feed/reviews case): pages arrive and fold into one growing
// list — REPLACE on page 1 (a fresh open, or a post-mutation refetch of the head), APPEND with per-key dedupe
// on the rest. The dedupe is what absorbs mid-pagination drift: an item that slides across a page boundary
// between requests would otherwise show twice. Fetch-agnostic like usePager — the hook owns page +
// accumulation STATE, never the request; the ViewModel stays the one data door (SKYFE002), parameterizes its
// generated hook with `acc.page` and folds the response back in. Graduated from the hostpoint pilot's
// PublicPointReviews.
//
// The two-step shape (`useAccumulatedPages` above the query, `fold` below it) is the only acyclic wiring:
// the hook owns the `page` the query needs, and the query owns the response the fold needs. `fold` runs at
// render time on React's sanctioned "adjust state when a prop changes" pattern (a render-phase set, an
// immediate re-render before commit), guarded by the identity of the last folded page — it settles in one
// extra pass, and a re-render without new data folds nothing.

export interface Accumulation<T> {
  /** Everything folded so far, in arrival order (the head first). */
  items: readonly T[];
  /** More pages exist beyond the accumulation — drives the "see more" affordance. */
  hasMore: boolean;
}

export interface AccumulatedPagesOptions<T> {
  /** Identity for the dedupe — typically the item's id. */
  keyOf: (item: T) => string | number;
  /** The accumulation's scope (e.g. the parent resource's id) — a different value starts from scratch. */
  resetKey?: unknown;
}

export interface AccumulatedPages<T> {
  /** 1-based — the generated hook's `page` param. */
  page: number;
  /**
   * Fold the latest page in — call during render, with the page taken STRAIGHT off `query.data` (a stable
   * cache identity; a page object rebuilt inline every render would re-fold forever). Project items for
   * display AFTER folding, never before.
   */
  fold: (current: Page<T> | undefined) => Accumulation<T>;
  /**
   * Request the next page — a no-op while no more are known to exist. Guard the BUTTON with the query's
   * `isFetching` (the pilot's `loadingMore`): the fetch-agnostic hook cannot see in-flight state, and a
   * double-tap would otherwise skip a page.
   */
  loadMore: () => void;
  /** Rewind to page 1 keeping the list on screen — the fresh head REPLACES it on arrival (post-submit). */
  reset: () => void;
}

interface AccState<T> {
  page: number;
  items: readonly T[];
  totalCount: number;
  folded: Page<T> | undefined;
  resetKey: unknown;
}

export function useAccumulatedPages<T>(options: AccumulatedPagesOptions<T>): AccumulatedPages<T> {
  const [state, setState] = useState<AccState<T>>({
    page: 1,
    items: [],
    totalCount: 0,
    folded: undefined,
    resetKey: options.resetKey,
  });

  // A changed resetKey starts a fresh accumulation — the render-phase adjustment above. `folded` is
  // deliberately KEPT: under keepPreviousData the query still serves the previous key's page as placeholder
  // this render, and holding its identity is what keeps it out of the new accumulation.
  const resetPending = !Object.is(state.resetKey, options.resetKey);
  if (resetPending) {
    setState({ page: 1, items: [], totalCount: 0, folded: state.folded, resetKey: options.resetKey });
  }

  const fold = (current: Page<T> | undefined): Accumulation<T> => {
    if (resetPending) return { items: [], hasMore: false };
    if (current === undefined || current === state.folded) {
      return { items: state.items, hasMore: state.items.length < state.totalCount };
    }
    const items = current.pageNumber <= 1 ? current.items : merge(state.items, current.items, options.keyOf);
    setState({ ...state, items, totalCount: current.totalCount, folded: current });
    return { items, hasMore: items.length < current.totalCount };
  };

  return {
    page: state.page,
    fold,
    loadMore: () => setState((s) => (s.items.length < s.totalCount ? { ...s, page: s.page + 1 } : s)),
    reset: () => setState((s) => (s.page === 1 ? s : { ...s, page: 1 })),
  };
}

// Append with per-key dedupe — and refresh in place: when an already-shown item arrives again (a page
// boundary slid), the fresh copy wins at the old position, so the list never doubles and never goes stale.
function merge<T>(
  prev: readonly T[],
  incoming: readonly T[],
  keyOf: (item: T) => string | number,
): readonly T[] {
  const fresh = new Map(incoming.map((item) => [keyOf(item), item] as const));
  const prevKeys = new Set(prev.map((item) => keyOf(item)));
  return [
    ...prev.map((item) => fresh.get(keyOf(item)) ?? item),
    ...incoming.filter((item) => !prevKeys.has(keyOf(item))),
  ];
}
