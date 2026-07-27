import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSession } from "./useSession";

// The boot gate: not ready until the bootstrap settles, ready after — success OR failure (an anonymous
// session is a settled session; only an unsettled one may hold the navigator).
describe("useSession", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is not ready until the bootstrap settles, then ready", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result } = renderHook(() => useSession(() => gate));

    expect(result.current.ready).toBe(false);
    release();
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it("settles ready even when the bootstrap fails — anonymous is a state, not a hang", async () => {
    const { result } = renderHook(() => useSession(() => Promise.reject(new Error("offline"))));

    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  // Seed 2 — a bootstrap that NEVER resolves (a hung socket on cold-start) would pin the app on the splash
  // forever. The timeoutMs fallback opens the gate anyway so the guard can decide (→ login).
  it("settles ready after timeoutMs even when the bootstrap never resolves (no infinite splash)", () => {
    vi.useFakeTimers();
    const neverResolves = () => new Promise<void>(() => {});
    const { result } = renderHook(() => useSession(neverResolves, { timeoutMs: 5000 }));

    expect(result.current.ready).toBe(false);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.ready).toBe(true);
  });

  it("without timeoutMs a hung bootstrap stays unsettled (the opt-out keeps the original wait-forever)", () => {
    vi.useFakeTimers();
    const neverResolves = () => new Promise<void>(() => {});
    const { result } = renderHook(() => useSession(neverResolves));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.ready).toBe(false);
  });
});
