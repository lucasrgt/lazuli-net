import { describe, expect, it } from "vitest";
import { orderedLifecycle } from "./index.js";

const lifecycle = orderedLifecycle(["profile", "identity", "review", "done"] as const);

describe("orderedLifecycle", () => {
  it("reports steps at and behind the cursor as reached", () => {
    expect(lifecycle.reached("identity", "profile")).toBe(true);
    expect(lifecycle.reached("identity", "identity")).toBe(true);
  });

  it("prevents reaching or advancing through a future step", () => {
    expect(lifecycle.reached("profile", "identity")).toBe(false);
    expect(lifecycle.advance("profile", "identity", "review")).toBe("profile");
  });

  it("prevents a caller from skipping or reversing the declared next state", () => {
    expect(lifecycle.advance("profile", "profile", "review")).toBe("profile");
    expect(lifecycle.advance("identity", "identity", "profile")).toBe("identity");
  });

  it("advances when exactly the current step is completed", () => {
    expect(lifecycle.advance("identity", "identity", "review")).toBe("review");
  });

  it("does not regress when an earlier completed step is edited", () => {
    expect(lifecycle.advance("review", "profile", "identity")).toBe("review");
  });

  it("rejects ambiguous lifecycle declarations", () => {
    expect(() => orderedLifecycle([])).toThrow("at least one state");
    expect(() => orderedLifecycle(["draft", "draft"])).toThrow("duplicate states");
  });

  it("rejects states outside a broadly typed runtime definition", () => {
    const dynamicStates: readonly string[] = ["first", "second"];
    const dynamicLifecycle = orderedLifecycle(dynamicStates);

    expect(() => dynamicLifecycle.reached("missing", "first")).toThrow(
      "does not belong",
    );
  });
});
