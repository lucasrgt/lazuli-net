import { describe, expect, it } from "vitest";
import { ErrorKind, Errors, Result } from "./index.js";

describe("Result", () => {
  it("keeps successful values directly readable after narrowing", () => {
    const result = Result.ok({ balance: 42 });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.balance).toBe(42);
  });

  it("keeps stable error codes on expected failures", () => {
    const result = Result.fail(Errors.notFound("wallets.not_found", "wallet not found"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(ErrorKind.NotFound);
      expect(result.error.code).toBe("wallets.not_found");
    }
  });

  it("collects field failures in one validation result", () => {
    const error = Errors.validation([
      { field: "email", code: "email.invalid", message: "email is invalid" },
      { field: "name", code: "name.required", message: "name is required" },
    ]);

    expect(error.code).toBe("validation.failed");
    expect(error.fields).toHaveLength(2);
  });
});
