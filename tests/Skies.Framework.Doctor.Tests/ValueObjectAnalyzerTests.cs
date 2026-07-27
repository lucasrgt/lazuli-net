namespace Skies.Framework.Doctor.Tests;

public class ValueObjectAnalyzerTests
{
    [Fact]
    public Task Always_valid_value_object_reports_nothing() =>
        Harness<ValueObjectAnalyzer>.Verify(Valid);

    [Fact]
    public Task Value_object_with_a_public_setter_is_flagged() =>
        Harness<ValueObjectAnalyzer>.Verify(PublicSetter);

    [Fact]
    public Task Value_object_with_a_public_constructor_is_flagged() =>
        Harness<ValueObjectAnalyzer>.Verify(PublicConstructor);

    [Fact]
    public Task Value_object_without_a_smart_constructor_is_flagged() =>
        Harness<ValueObjectAnalyzer>.Verify(NoSmartConstructor);

    [Fact]
    public Task Positional_value_object_is_flagged() =>
        Harness<ValueObjectAnalyzer>.Verify(Positional);

    // The Money shape: immutable, private ctor, a static From returning Result<Money> — nothing to flag.
    private const string Valid = """
        using System;

        [ValueObject]
        public readonly struct Money
        {
            public decimal Amount { get; }
            private Money(decimal amount) => Amount = amount;
            public static Result<Money> From(decimal amount) => new Result<Money>();
        }

        public sealed class ValueObjectAttribute : Attribute { }
        public struct Result<T> { }
        """;

    private const string PublicSetter = """
        using System;

        [ValueObject]
        public sealed class Email
        {
            public string {|SKY0013:Value|} { get; set; }
            private Email(string value) => Value = value;
            public static Result<Email> From(string value) => new Result<Email>();
        }

        public sealed class ValueObjectAttribute : Attribute { }
        public struct Result<T> { }
        """;

    private const string PublicConstructor = """
        using System;

        [ValueObject]
        public sealed class Email
        {
            public string Value { get; }
            public {|SKY0013:Email|}(string value) => Value = value;
            public static Result<Email> From(string value) => new Result<Email>();
        }

        public sealed class ValueObjectAttribute : Attribute { }
        public struct Result<T> { }
        """;

    private const string NoSmartConstructor = """
        using System;

        [ValueObject]
        public readonly struct {|SKY0013:Money|}
        {
            public decimal Amount { get; }
            private Money(decimal amount) => Amount = amount;
        }

        public sealed class ValueObjectAttribute : Attribute { }
        """;

    // A positional record carries a public primary constructor — a way in that skips the smart constructor.
    private const string Positional = """
        using System;

        [ValueObject]
        public readonly record struct {|SKY0013:Money|}(decimal Amount)
        {
            public static Result<Money> From(decimal amount) => new Result<Money>();
        }

        public sealed class ValueObjectAttribute : Attribute { }
        public struct Result<T> { }
        """;
}
