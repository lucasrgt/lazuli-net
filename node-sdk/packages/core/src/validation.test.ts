import { describe, expect, it } from "vitest";
import { ErrorKind, Errors, Result, Validation } from "./index.js";

describe("Validation", () => {
  it("accumulates check and add failures in insertion order", () => {
    const validation = new Validation()
      .check(true, "accepted", "accepted.invalid", "must not be recorded")
      .check(false, "name", "name.required", "name is required")
      .add("email", "email.invalid", "email is invalid");

    expect(validation.failed).toBe(true);
    expect(validation.toError()).toEqual({
      kind: ErrorKind.Validation,
      code: "validation.failed",
      message: "Validation failed",
      fields: [
        { field: "name", code: "name.required", message: "name is required" },
        { field: "email", code: "email.invalid", message: "email is invalid" },
      ],
    });
  });

  it("collects a flat smart-constructor failure under the requested field", () => {
    const amount = Result.fail<number>(
      Errors.validation("amount.negative", "cannot be negative"),
    );

    const validation = new Validation().collect("amount", amount);

    expect(validation.toError().fields).toEqual([
      { field: "amount", code: "amount.negative", message: "cannot be negative" },
    ]);
  });

  it("ignores successful collected results", () => {
    const validation = new Validation().collect("amount", Result.ok(25));

    expect(validation.failed).toBe(false);
    expect(validation.toError().fields).toEqual([]);
  });

  it("preserves nested field paths and specific codes instead of flattening them", () => {
    const nested = new Validation()
      .check(false, "installments", "installments.mismatch", "must match the total")
      .check(
        false,
        "installments[0].valueInCents",
        "installments.invalid",
        "must be positive",
      )
      .toError();

    const fields = new Validation()
      .collect("installments", Result.fail(nested))
      .toError().fields;

    expect(fields).toEqual([
      {
        field: "installments",
        code: "installments.mismatch",
        message: "must match the total",
      },
      {
        field: "installments[0].valueInCents",
        code: "installments.invalid",
        message: "must be positive",
      },
    ]);
    expect(fields).not.toContainEqual(expect.objectContaining({ code: "validation.failed" }));
  });

  it("requires a syntactically valid, non-nil UUID", () => {
    const validation = new Validation()
      .require(undefined, "missing", "missing.required")
      .require("00000000-0000-0000-0000-000000000000", "nil", "nil.required")
      .require("not-a-uuid", "malformed", "malformed.required")
      .require("8B132D73-FEBE-4FB7-9D1E-240BF3C2D7B4", "walletId", "walletId.required");

    expect(validation.toError().fields).toEqual([
      { field: "missing", code: "missing.required", message: "is required" },
      { field: "nil", code: "nil.required", message: "is required" },
      { field: "malformed", code: "malformed.required", message: "is required" },
    ]);
  });

  it("rejects null, empty, and whitespace-only text but accepts content", () => {
    const validation = new Validation()
      .notBlank(null, "null", "null.required")
      .notBlank("", "empty", "empty.required")
      .notBlank(" \t\n", "whitespace", "whitespace.required")
      .notBlank(" Ada ", "name", "name.required");

    expect(validation.toError().fields?.map(({ field }) => field)).toEqual([
      "null",
      "empty",
      "whitespace",
    ]);
  });

  it("accepts both numeric bounds and records values outside the interval", () => {
    const validation = new Validation()
      .inRange(1, 1, 10, "low", "low.range")
      .inRange(10, 1, 10, "high", "high.range")
      .inRange(0, 1, 10, "under", "under.range")
      .inRange(11, 1, 10, "over", "over.range")
      .inRange(Number.NaN, 1, 10, "nan", "nan.range");

    expect(validation.toError().fields).toEqual([
      { field: "under", code: "under.range", message: "must be between 1 and 10" },
      { field: "over", code: "over.range", message: "must be between 1 and 10" },
      { field: "nan", code: "nan.range", message: "must be between 1 and 10" },
    ]);
  });

  it("supports inclusive bigint bounds without losing their developer message", () => {
    const validation = new Validation()
      .inRange(1n, 1n, 2n, "low", "low.range")
      .inRange(3n, 1n, 2n, "over", "over.range");

    expect(validation.toError().fields).toEqual([
      { field: "over", code: "over.range", message: "must be between 1 and 2" },
    ]);
  });

  it("returns an error snapshot that later accumulation cannot mutate", () => {
    const validation = new Validation().add("first", "first.invalid", "first failed");
    const firstError = validation.toError();

    validation.add("second", "second.invalid", "second failed");

    expect(firstError.fields).toHaveLength(1);
    expect(validation.toError().fields).toHaveLength(2);
  });
});
