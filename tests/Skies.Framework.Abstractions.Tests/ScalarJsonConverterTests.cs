using System.Text.Json;
using System.Text.Json.Serialization;
using Skies.Framework.Abstractions;

namespace Skies.Framework.Abstractions.Tests;

public class ScalarJsonConverterTests
{
    [JsonConverter(typeof(CentsJsonConverter))]
    private readonly record struct Cents
    {
        public long Value { get; }

        private Cents(long value) => Value = value;

        public static Result<Cents> From(long value) =>
            value >= 0 ? new Cents(value) : Error.Validation("cents.negative", "cannot be negative");

        private sealed class CentsJsonConverter() : ScalarJsonConverter<Cents, long>(c => c.Value, From);
    }

    [Fact]
    public void Writes_the_value_object_as_its_primitive()
    {
        // The wire shape matches the primitive the type replaced — the value object is a backend
        // guarantee, not a contract change.
        Assert.Equal("125", JsonSerializer.Serialize(Cents.From(125).Value));
    }

    [Fact]
    public void Reads_the_primitive_back_through_the_smart_constructor()
    {
        Assert.Equal(125, JsonSerializer.Deserialize<Cents>("125").Value);
    }

    [Fact]
    public void Invalid_wire_input_fails_as_a_json_error_at_the_boundary()
    {
        // The smart constructor stays the single source of the rule: a negative on the wire surfaces as a
        // JsonException (a 400), never as a constructed-invalid instance.
        var ex = Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<Cents>("-1"));
        Assert.Contains("cannot be negative", ex.Message);
    }

    [Fact]
    public void Round_trips_inside_a_containing_record()
    {
        var json = JsonSerializer.Serialize(new Wrapper(Cents.From(99).Value));
        Assert.Equal("""{"Amount":99}""", json);
        Assert.Equal(99, JsonSerializer.Deserialize<Wrapper>(json)!.Amount.Value);
    }

    private sealed record Wrapper(Cents Amount);
}
