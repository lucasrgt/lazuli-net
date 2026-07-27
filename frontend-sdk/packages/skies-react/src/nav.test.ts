import { describe, it, expect, vi } from "vitest";
import { safeBack } from "./nav";

// safeBack is the dead-"Back"-button fix: on web a deep-linked screen has no in-app history, so a bare back() does
// nothing. Pin both edges — it must POP when there is history and REPLACE to the fallback when there is not.
describe("safeBack", () => {
  it("pops the stack when there is history (and does not touch the fallback)", () => {
    const back = vi.fn();
    const replace = vi.fn();
    safeBack({ canGoBack: () => true, back, replace }, "/");
    expect(back).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

  it("replaces to the fallback when there is no history (so the button is never dead)", () => {
    const back = vi.fn();
    const replace = vi.fn();
    safeBack({ canGoBack: () => false, back, replace }, "/home");
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith("/home");
    expect(back).not.toHaveBeenCalled();
  });
});
