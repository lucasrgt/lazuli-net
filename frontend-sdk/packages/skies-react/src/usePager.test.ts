import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePager } from "./usePager";

describe("usePager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts on page 1 with an empty term", () => {
    const { result } = renderHook(() => usePager());

    expect(result.current.page).toBe(1);
    expect(result.current.q).toBe("");
    expect(result.current.debouncedQ).toBe("");
  });

  it("an initialQ starts already settled (trimmed), on page 1", () => {
    const { result } = renderHook(() => usePager({ initialQ: " camp " }));

    expect(result.current.q).toBe(" camp ");
    expect(result.current.debouncedQ).toBe("camp");
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.page).toBe(1);
  });

  it("debounces the term and rewinds to page 1 when it settles", () => {
    const { result } = renderHook(() => usePager());
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.page).toBe(3);

    act(() => result.current.setQ("ca"));
    act(() => vi.advanceTimersByTime(299));
    expect(result.current.debouncedQ).toBe("");
    expect(result.current.page).toBe(3);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.debouncedQ).toBe("ca");
    expect(result.current.page).toBe(1);
  });

  it("retyping re-arms the timer — only the final term settles", () => {
    const { result } = renderHook(() => usePager());

    act(() => result.current.setQ("c"));
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.setQ("ca"));
    act(() => vi.advanceTimersByTime(200)); // 400ms since "c" — its timer was cleared by the retype
    expect(result.current.debouncedQ).toBe("");

    act(() => vi.advanceTimersByTime(100)); // 300ms since "ca"
    expect(result.current.debouncedQ).toBe("ca");
  });

  it("re-settling the SAME trimmed term does not rewind the page", () => {
    const { result } = renderHook(() => usePager());
    act(() => result.current.setQ(" camp "));
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.debouncedQ).toBe("camp");
    act(() => result.current.next());
    expect(result.current.page).toBe(2);

    act(() => result.current.setQ("camp  "));
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.debouncedQ).toBe("camp");
    expect(result.current.page).toBe(2);
  });

  it("next clamps to pageCount when known, roams free when not; prev floors at 1", () => {
    const { result } = renderHook(() => usePager());

    act(() => result.current.next(3));
    act(() => result.current.next(3));
    act(() => result.current.next(3));
    expect(result.current.page).toBe(3);

    act(() => result.current.next());
    expect(result.current.page).toBe(4); // total unknown — unclamped

    act(() => result.current.prev());
    act(() => result.current.prev());
    act(() => result.current.prev());
    act(() => result.current.prev());
    expect(result.current.page).toBe(1);
    act(() => result.current.prev());
    expect(result.current.page).toBe(1);
  });

  it("reset rewinds the page and keeps the term", () => {
    const { result } = renderHook(() => usePager());
    act(() => result.current.setQ("camp"));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.next());
    expect(result.current.page).toBe(2);

    act(() => result.current.reset());
    expect(result.current.page).toBe(1);
    expect(result.current.debouncedQ).toBe("camp");
  });

  it("supports direct jumps and a configurable page size", () => {
    const { result } = renderHook(() => usePager({ initialPageSize: 20 }));

    act(() => result.current.goTo(4, 10));
    expect(result.current.page).toBe(4);
    act(() => result.current.setPageSize(50));
    expect(result.current.pageSize).toBe(50);
    expect(result.current.page).toBe(1);
  });

  it("can delegate page ownership to a router binding", () => {
    let page = 3;
    const setPage = vi.fn((next: number) => {
      page = next;
    });
    const { result, rerender } = renderHook(() => usePager({ pageControl: { page, setPage } }));

    act(() => result.current.next(8));
    expect(setPage).toHaveBeenCalledWith(4);
    rerender();
    expect(result.current.page).toBe(4);
  });
});
