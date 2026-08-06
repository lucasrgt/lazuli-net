import { Result, type Result as ResultValue } from "./result.js";

/** JSON scalar values that value objects can replace transparently on the wire. */
export type ScalarPrimitive = string | number | boolean;

/** The primitive JSON Schema type emitted for a scalar value object. */
export type ScalarPrimitiveType<TPrimitive extends ScalarPrimitive> =
  TPrimitive extends string ? "string"
    : TPrimitive extends boolean ? "boolean"
      : "integer" | "number";

/** Runtime wire metadata retained after TypeScript's generic types have been erased. */
export interface ScalarPrimitiveSchema<TPrimitive extends ScalarPrimitive> {
  /** The JSON Schema primitive type; numbers distinguish integral and fractional contracts. */
  readonly type: ScalarPrimitiveType<TPrimitive>;
  /** An optional standard schema format such as `uuid`, `int64`, or `double`. */
  readonly format?: string;
}

/**
 * Converts a scalar value object to and from the primitive that replaces it on the wire.
 * Decoding returns a Result so the smart constructor remains the single source of inbound rules.
 */
export interface ScalarCodec<TValue, TPrimitive extends ScalarPrimitive> {
  /** Runtime primitive metadata for contract adapters. */
  readonly primitive: ScalarPrimitiveSchema<TPrimitive>;
  /** Projects a valid value object to its JSON primitive. */
  encode(value: TValue): TPrimitive;
  /** Reconstructs through the value object's smart constructor. */
  decode(primitive: TPrimitive): ResultValue<TValue>;
}

/** Definition accepted by {@link scalarCodec}. */
export interface ScalarCodecDefinition<TValue, TPrimitive extends ScalarPrimitive> {
  /** Runtime primitive metadata for contract adapters. */
  readonly primitive: ScalarPrimitiveSchema<TPrimitive>;
  /** Projects a valid value object to its JSON primitive. */
  readonly encode: (value: TValue) => TPrimitive;
  /** Reconstructs through the value object's smart constructor. */
  readonly decode: (primitive: TPrimitive) => ResultValue<TValue>;
}

/**
 * Defines a codec backed by a smart constructor. The returned object is ordinary data and functions,
 * so transport adapters can use it without registration or reflection.
 */
export function scalarCodec<TValue, TPrimitive extends ScalarPrimitive>(
  definition: ScalarCodecDefinition<TValue, TPrimitive>,
): ScalarCodec<TValue, TPrimitive> {
  return Object.freeze({ ...definition });
}

/** Definition accepted by {@link trustedScalarCodec}. */
export interface TrustedScalarCodecDefinition<TValue, TPrimitive extends ScalarPrimitive> {
  /** Runtime primitive metadata for contract adapters. */
  readonly primitive: ScalarPrimitiveSchema<TPrimitive>;
  /** Projects a valid value object to its JSON primitive. */
  readonly encode: (value: TValue) => TPrimitive;
  /** Rehydrates a value already trusted by the caller. */
  readonly decode: (primitive: TPrimitive) => TValue;
}

/**
 * Defines a codec for trusted rehydration, lifting its decoder into a successful Result. Use
 * {@link scalarCodec} at untrusted boundaries where construction can fail.
 */
export function trustedScalarCodec<TValue, TPrimitive extends ScalarPrimitive>(
  definition: TrustedScalarCodecDefinition<TValue, TPrimitive>,
): ScalarCodec<TValue, TPrimitive> {
  return Object.freeze({
    primitive: definition.primitive,
    encode: definition.encode,
    decode: (primitive: TPrimitive) => Result.ok(definition.decode(primitive)),
  });
}
