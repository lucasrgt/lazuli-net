namespace Skies.Framework.Doctor.Tests;

public class EntityAnalyzerTests
{
    [Fact]
    public Task Encapsulated_entity_reports_nothing() =>
        Harness<EntityAnalyzer>.Verify(Valid);

    [Fact]
    public Task Entity_with_a_public_setter_is_flagged() =>
        Harness<EntityAnalyzer>.Verify(PublicSetter);

    [Fact]
    public Task Entity_with_a_public_constructor_is_flagged() =>
        Harness<EntityAnalyzer>.Verify(PublicConstructor);

    [Fact]
    public Task Entity_without_a_constructor_is_flagged() =>
        Harness<EntityAnalyzer>.Verify(NoConstructor);

    [Fact]
    public Task Entity_without_an_invariant_funnel_is_flagged() =>
        Harness<EntityAnalyzer>.Verify(NoFunnel);

    // The Wallet shape: private setters, a private ctor for EF, a static factory, and the EnsureValid funnel.
    private const string Valid = """
        using System;

        [Entity]
        public class Wallet
        {
            public Guid Id { get; private set; }
            private Wallet() { }
            public static Result<Wallet> Open(Guid id) => new Wallet().EnsureValid();
            public Result<Wallet> Withdraw() => EnsureValid();
            private Result<Wallet> EnsureValid() => new Result<Wallet>();
        }

        public sealed class EntityAttribute : Attribute { }
        public struct Result<T> { }
        """;

    private const string PublicSetter = """
        using System;

        [Entity]
        public class Wallet
        {
            public decimal {|SKY0014:Balance|} { get; set; }
            private Wallet() { }
            private Result<Wallet> EnsureValid() => new Result<Wallet>();
        }

        public sealed class EntityAttribute : Attribute { }
        public struct Result<T> { }
        """;

    private const string PublicConstructor = """
        using System;

        [Entity]
        public class Wallet
        {
            public Guid Id { get; private set; }
            public {|SKY0014:Wallet|}() { }
            private Result<Wallet> EnsureValid() => new Result<Wallet>();
        }

        public sealed class EntityAttribute : Attribute { }
        public struct Result<T> { }
        """;

    // No declared constructor means the compiler emits a public parameterless one — a public way in.
    private const string NoConstructor = """
        using System;

        [Entity]
        public class {|SKY0014:Wallet|}
        {
            public Guid Id { get; private set; }
            private Result<Wallet> EnsureValid() => new Result<Wallet>();
        }

        public sealed class EntityAttribute : Attribute { }
        public struct Result<T> { }
        """;

    private const string NoFunnel = """
        using System;

        [Entity]
        public class {|SKY0014:Wallet|}
        {
            public Guid Id { get; private set; }
            private Wallet() { }
            public static Wallet Open(Guid id) => new Wallet();
        }

        public sealed class EntityAttribute : Attribute { }
        public struct Result<T> { }
        """;
}
