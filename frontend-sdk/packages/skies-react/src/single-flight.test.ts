import { describe, expect, it, vi } from "vitest";
import { singleFlight } from "./single-flight";

// The single-flight gate exists so concurrent callers share ONE rotation — two 401s, or a double-invoked boot
// effect (StrictMode), must not fire two refreshes and trip the backend's theft detection (the SKYFE029 hazard).
describe("singleFlight", () => {
  it("collapses concurrent calls into one execution, all sharing the result", async () => {
    let calls = 0;
    let release!: (v: string) => void;
    const gated = singleFlight(() => {
      calls++;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    });

    const a = gated();
    const b = gated();
    const c = gated();
    release("token");

    expect(await Promise.all([a, b, c])).toEqual(["token", "token", "token"]);
    expect(calls).toBe(1); // one rotation, not three
  });

  it("reopens the gate after settling — a later call runs fresh", async () => {
    let calls = 0;
    const gated = singleFlight(async () => {
      calls++;
      return calls;
    });

    expect(await gated()).toBe(1);
    expect(await gated()).toBe(2); // gate reopened — a genuine re-bootstrap still runs

    expect(calls).toBe(2);
  });

  it("reopens the gate after a REJECTION too (a failed rotation doesn't wedge the gate shut)", async () => {
    let calls = 0;
    const gated = singleFlight(async () => {
      calls++;
      if (calls === 1) throw new Error("boom");
      return "ok";
    });

    await expect(gated()).rejects.toThrow("boom");
    expect(await gated()).toBe("ok"); // not stuck on the rejected promise

    expect(calls).toBe(2);
  });

  it("gates a synchronous throw as a rejection (never escapes before the gate is armed)", async () => {
    const gated = singleFlight((): Promise<void> => {
      throw new Error("sync");
    });

    await expect(gated()).rejects.toThrow("sync");
  });
});
