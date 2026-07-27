import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAccumulatedPages } from "./useAccumulatedPages";
import type { Page } from "./page";

interface Review {
  id: string;
  comment: string;
}

const pageOf = (pageNumber: number, totalCount: number, items: Review[]): Page<Review> => ({
  items,
  totalCount,
  pageNumber,
  pageSize: 2,
});

// The ViewModel shape, miniaturized: the hook above the (simulated) query, the fold below it.
function setup(initial: { current: Page<Review> | undefined; resetKey?: unknown }) {
  return renderHook(
    ({ current, resetKey }: { current: Page<Review> | undefined; resetKey?: unknown }) => {
      const acc = useAccumulatedPages<Review>({ keyOf: (r) => r.id, resetKey });
      return { acc, ...acc.fold(current) };
    },
    { initialProps: initial },
  );
}

const a = { id: "a", comment: "first" };
const b = { id: "b", comment: "second" };
const c = { id: "c", comment: "third" };
const d = { id: "d", comment: "fourth" };

describe("useAccumulatedPages", () => {
  it("starts empty — nothing folded, nothing more, page 1", () => {
    const { result } = setup({ current: undefined });

    expect(result.current.acc.page).toBe(1);
    expect(result.current.items).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it("folds page 1 and reads hasMore off the total", () => {
    const { result } = setup({ current: pageOf(1, 5, [a, b]) });

    expect(result.current.items).toEqual([a, b]);
    expect(result.current.hasMore).toBe(true);
  });

  it("a re-render with the same page identity folds nothing", () => {
    const first = pageOf(1, 2, [a, b]);
    const { result, rerender } = setup({ current: first });
    const folded = result.current.items;

    rerender({ current: first });

    expect(result.current.items).toBe(folded);
  });

  it("loadMore advances the page; the arriving page appends with dedupe, the fresh copy winning in place", () => {
    const { result, rerender } = setup({ current: pageOf(1, 5, [a, b]) });

    act(() => result.current.acc.loadMore());
    expect(result.current.acc.page).toBe(2);

    // Mid-pagination drift: "b" slid onto page 2 (and was edited meanwhile); "c" is genuinely new.
    const freshB = { id: "b", comment: "second, edited" };
    rerender({ current: pageOf(2, 5, [freshB, c]) });

    expect(result.current.items).toEqual([a, freshB, c]);
    expect(result.current.hasMore).toBe(true);
  });

  it("a fresh page 1 REPLACES the accumulation (the post-mutation refetch of the head)", () => {
    const { result, rerender } = setup({ current: pageOf(1, 5, [a, b]) });
    act(() => result.current.acc.loadMore());
    rerender({ current: pageOf(2, 5, [c, d]) });
    expect(result.current.items).toHaveLength(4);

    rerender({ current: pageOf(1, 1, [d]) });

    expect(result.current.items).toEqual([d]);
    expect(result.current.hasMore).toBe(false);
  });

  it("loadMore is a no-op before anything is known and once everything is in", () => {
    const { result, rerender } = setup({ current: undefined });

    act(() => result.current.acc.loadMore());
    expect(result.current.acc.page).toBe(1); // nothing known yet

    rerender({ current: pageOf(1, 2, [a, b]) }); // the whole set in one page
    act(() => result.current.acc.loadMore());
    expect(result.current.acc.page).toBe(1);
    expect(result.current.hasMore).toBe(false);
  });

  it("a changed resetKey starts from scratch and ignores the lingering placeholder page", () => {
    const pointA = pageOf(1, 5, [a, b]);
    const { result, rerender } = setup({ current: pointA, resetKey: "point-a" });
    act(() => result.current.acc.loadMore());
    expect(result.current.acc.page).toBe(2);

    // keepPreviousData: the query still hands back point A's page while point B loads — it must NOT fold.
    rerender({ current: pointA, resetKey: "point-b" });
    expect(result.current.acc.page).toBe(1);
    expect(result.current.items).toEqual([]);
    expect(result.current.hasMore).toBe(false);

    rerender({ current: pageOf(1, 1, [c]), resetKey: "point-b" });
    expect(result.current.items).toEqual([c]);
  });

  it("reset rewinds the page but keeps the list until the fresh head arrives", () => {
    const { result, rerender } = setup({ current: pageOf(1, 4, [a, b]) });
    act(() => result.current.acc.loadMore());
    rerender({ current: pageOf(2, 4, [c, d]) });
    expect(result.current.items).toHaveLength(4);

    act(() => result.current.acc.reset());
    expect(result.current.acc.page).toBe(1);
    expect(result.current.items).toHaveLength(4); // still on screen — no blink

    rerender({ current: pageOf(1, 4, [d, c]) }); // the refetched head, a new identity
    expect(result.current.items).toEqual([d, c]);
  });
});
