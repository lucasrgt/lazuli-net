using System;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Skies.Framework.Abstractions;

/// <summary>
/// Makes a scalar <c>[ValueObject]</c> transparent on the wire: it serializes as the primitive it wraps
/// (<c>Money</c> as its cents number, <c>Slug</c> as its string), so the type is a backend guarantee, not a
/// contract change — the JSON shape matches the primitive it replaced, and the generated client types it as
/// that primitive instead of an empty object schema.
///
/// Subclass it next to the value object and point <c>[JsonConverter]</c> at the subclass:
/// <code>
/// [ValueObject]
/// [JsonConverter(typeof(MoneyJsonConverter))]
/// public readonly record struct Money
/// {
///     // ...
///     private sealed class MoneyJsonConverter() : ScalarJsonConverter&lt;Money, long&gt;(m =&gt; m.Cents, Money.From);
/// }
/// </code>
/// The smart-constructor overload keeps the value object the single source of its rule on the way <em>in</em>:
/// an invalid wire value surfaces as a <see cref="JsonException"/> (a 400 at the boundary), never as a
/// constructed-invalid instance. <c>Skies.Framework.AspNetCore</c>'s OpenAPI wiring recognizes subclasses of this type
/// and mirrors the primitive in the contract schema, so the transparency holds end-to-end without a per-type
/// schema transformer in the app.
/// </summary>
/// <typeparam name="TValueObject">The scalar value object.</typeparam>
/// <typeparam name="TPrimitive">The primitive it wraps on the wire (e.g. <c>long</c>, <c>string</c>, <c>decimal</c>).</typeparam>
public abstract class ScalarJsonConverter<TValueObject, TPrimitive> : JsonConverter<TValueObject>
{
    private readonly Func<TValueObject, TPrimitive> _toPrimitive;
    private readonly Func<TPrimitive, TValueObject> _fromPrimitive;

    /// <summary>Wire the conversion from a trusted rehydrator (a <c>FromStored</c>-shaped factory that cannot fail).</summary>
    /// <param name="toPrimitive">Projects the value object to the primitive written on the wire.</param>
    /// <param name="fromPrimitive">Rehydrates the value object from a wire primitive.</param>
    protected ScalarJsonConverter(Func<TValueObject, TPrimitive> toPrimitive, Func<TPrimitive, TValueObject> fromPrimitive)
    {
        _toPrimitive = toPrimitive;
        _fromPrimitive = fromPrimitive;
    }

    /// <summary>Wire the conversion from the value object's smart constructor: a failed construction surfaces
    /// as a <see cref="JsonException"/> carrying the value object's own error message, so invalid wire input is
    /// rejected at the boundary with the single source of the rule intact.</summary>
    /// <param name="toPrimitive">Projects the value object to the primitive written on the wire.</param>
    /// <param name="fromPrimitive">The smart constructor (the <c>Money.From</c> shape).</param>
    protected ScalarJsonConverter(Func<TValueObject, TPrimitive> toPrimitive, Func<TPrimitive, Result<TValueObject>> fromPrimitive)
    {
        _toPrimitive = toPrimitive;
        _fromPrimitive = primitive =>
        {
            var result = fromPrimitive(primitive);
            if (result.IsFailure)
                throw new JsonException(result.Error.Message);
            return result.Value;
        };
    }

    /// <inheritdoc />
    public override TValueObject Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        _fromPrimitive(JsonSerializer.Deserialize<TPrimitive>(ref reader, options)!);

    /// <inheritdoc />
    public override void Write(Utf8JsonWriter writer, TValueObject value, JsonSerializerOptions options) =>
        JsonSerializer.Serialize(writer, _toPrimitive(value), options);
}
