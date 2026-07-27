import { describe, it, expect, vi } from "vitest";
import { type AsyncState, combineAsyncStates, mapAsyncState, toAsyncState } from "./async-state";

// The projection is the spine's load-bearing logic: every screen's state flows through it. Pin each branch — a
// regression here silently breaks loading/error/empty/ready across every feature at once.
describe("toAsyncState", () => {
  it("is loading while the query is pending", () => {
    expect(toAsyncState({ isPending: true, isError: false, data: undefined }, { errorMessage: "e" })).toEqual({
      status: "loading",
    });
  });

  it("is error on isError, carrying the localized message and a retry that calls refetch", () => {
    const refetch = vi.fn();
    const s = toAsyncState({ isPending: false, isError: true, data: undefined, refetch }, { errorMessage: "boom" });
    expect(s.status).toBe("error");
    if (s.status === "error") {
      expect(s.message).toBe("boom");
      s.retry?.();
      expect(refetch).toHaveBeenCalledOnce();
    }
  });

  it("is error when data is undefined even without isError", () => {
    expect(
      toAsyncState({ isPending: false, isError: false, data: undefined }, { errorMessage: "e" }).status,
    ).toBe("error");
  });

  it("omits retry when the query has no refetch", () => {
    const s = toAsyncState({ isPending: false, isError: true, data: undefined }, { errorMessage: "e" });
    if (s.status === "error") expect(s.retry).toBeUndefined();
  });

  it("is empty when the isEmpty predicate matches", () => {
    const s = toAsyncState({ isPending: false, isError: false, data: [] as number[] }, {
      errorMessage: "e",
      isEmpty: (d) => d.length === 0,
    });
    expect(s.status).toBe("empty");
  });

  it("is ready with the data otherwise", () => {
    const s = toAsyncState({ isPending: false, isError: false, data: [1, 2] }, {
      errorMessage: "e",
      isEmpty: (d) => d.length === 0,
    });
    expect(s).toEqual({ status: "ready", data: [1, 2] });
  });
});

// The multi-query composition — precedence is the part screens hand-roll wrong, so each rung is pinned.
describe("combineAsyncStates", () => {
  const ready = <T,>(data: T): AsyncState<T> => ({ status: "ready", data });

  it("is ready with the data tuple in argument order when all are ready", () => {
    expect(combineAsyncStates(ready(1), ready("a"))).toEqual({ status: "ready", data: [1, "a"] });
  });

  it("an error outranks a loading sibling — waiting can't un-fail it", () => {
    const s = combineAsyncStates<[AsyncState<number>, AsyncState<string>]>(
      { status: "error", message: "boom" },
      { status: "loading" },
    );
    expect(s.status).toBe("error");
    if (s.status === "error") expect(s.message).toBe("boom");
  });

  it("loading outranks empty — the whole isn't known to be empty until every source settles", () => {
    expect(combineAsyncStates({ status: "loading" }, { status: "empty" }).status).toBe("loading");
  });

  it("any empty empties the whole once everything settles", () => {
    expect(combineAsyncStates(ready(1), { status: "empty" }).status).toBe("empty");
  });

  it("the combined retry retries every errored source at once", () => {
    const a = vi.fn();
    const b = vi.fn();
    const s = combineAsyncStates<[AsyncState<number>, AsyncState<number>, AsyncState<number>]>(
      { status: "error", message: "a", retry: a },
      { status: "error", message: "b", retry: b },
      ready(1),
    );
    if (s.status === "error") s.retry?.();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });
});

describe("mapAsyncState", () => {
  it("projects ready data and preserves every non-ready branch", () => {
    expect(mapAsyncState({ status: "ready", data: 2 }, (value) => String(value))).toEqual({
      status: "ready",
      data: "2",
    });
    expect(mapAsyncState({ status: "loading" } as AsyncState<number>, String)).toEqual({ status: "loading" });
    expect(mapAsyncState({ status: "empty" } as AsyncState<number>, String)).toEqual({ status: "empty" });
    expect(mapAsyncState({ status: "error", message: "boom" } as AsyncState<number>, String)).toEqual({
      status: "error",
      message: "boom",
    });
  });
});
