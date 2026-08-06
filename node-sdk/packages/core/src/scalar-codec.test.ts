import { describe, expect, it } from "vitest";
import {
  Errors,
  Result,
  scalarCodec,
  trustedScalarCodec,
  type ScalarCodec,
} from "./index.js";

interface Cents {
  readonly value: number;
}

const centsCodec: ScalarCodec<Cents, number> = scalarCodec({
  primitive: { type: "integer", format: "int64" },
  encode: (cents) => cents.value,
  decode: (value) => value >= 0
    ? Result.ok({ value })
    : Result.fail(Errors.validation("cents.negative", "cannot be negative")),
});

describe("ScalarCodec", () => {
  it("writes the value object as the primitive it replaced", () => {
    expect(centsCodec.encode({ value: 125 })).toBe(125);
    expect(JSON.stringify({ amount: centsCodec.encode({ value: 125 }) })).toBe(
      '{"amount":125}',
    );
  });

  it("reads valid input through the smart constructor", () => {
    expect(centsCodec.decode(99)).toEqual(Result.ok({ value: 99 }));
  });

  it("preserves the smart constructor failure for invalid inbound input", () => {
    const decoded = centsCodec.decode(-1);

    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.error.code).toBe("cents.negative");
      expect(decoded.error.message).toBe("cannot be negative");
    }
  });

  it("retains primitive schema facts for contract adapters", () => {
    expect(centsCodec.primitive).toEqual({ type: "integer", format: "int64" });
  });

  it("lifts a trusted rehydrator into a successful decoder", () => {
    const slugCodec = trustedScalarCodec({
      primitive: { type: "string" },
      encode: (slug: { readonly value: string }) => slug.value,
      decode: (value: string) => ({ value }),
    });

    expect(slugCodec.decode("skies")).toEqual(Result.ok({ value: "skies" }));
    expect(slugCodec.encode({ value: "skies" })).toBe("skies");
  });
});
