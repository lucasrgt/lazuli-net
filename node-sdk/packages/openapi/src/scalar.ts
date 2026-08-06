import type {
  ScalarCodec,
  ScalarPrimitive,
  ScalarPrimitiveSchema,
} from "@skiesjs/core";
import { z, type ZodType } from "zod";

/**
 * Adapt one core scalar codec to a bidirectional Zod schema. Request parsing decodes the primitive through the
 * smart constructor; response encoding writes the primitive back. OpenAPI sees the same primitive wire schema.
 */
export function scalarSchema<TValue, TPrimitive extends ScalarPrimitive>(
  codec: ScalarCodec<TValue, TPrimitive>,
): ZodType<TValue, TPrimitive> {
  const wire = primitiveSchema(codec.primitive);
  const domain = z.custom<TValue>();
  return z.codec(wire, domain, {
    decode: (value, payload) => {
      const decoded = codec.decode(value);
      if (decoded.ok) return decoded.value;
      payload.issues.push({
        code: "custom",
        input: value,
        message: decoded.error.message,
        params: { skiesCode: decoded.error.code },
      });
      return z.NEVER;
    },
    encode: (value) => codec.encode(value),
  }) as ZodType<TValue, TPrimitive>;
}

function primitiveSchema<TPrimitive extends ScalarPrimitive>(
  primitive: ScalarPrimitiveSchema<TPrimitive>,
): ZodType<TPrimitive, TPrimitive> {
  let schema: ZodType;
  switch (primitive.type) {
    case "boolean": schema = z.boolean(); break;
    case "integer": schema = z.number().int(); break;
    case "number": schema = z.number(); break;
    case "string": schema = z.string(); break;
  }
  if (primitive.format !== undefined) schema = schema.meta({ format: primitive.format });
  return schema as ZodType<TPrimitive, TPrimitive>;
}
