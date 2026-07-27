namespace Skies.Framework.Doctor.Tests;

public class UnmarkedDomainTypeAnalyzerTests
{
    [Fact]
    public Task Marked_entity_and_value_object_state_report_nothing() =>
        Harness<UnmarkedDomainTypeAnalyzer>.Verify(Valid);

    [Fact]
    public Task A_DbSet_of_an_unmarked_type_is_flagged() =>
        Harness<UnmarkedDomainTypeAnalyzer>.Verify(UnmarkedEntity);

    [Fact]
    public Task A_complex_entity_member_that_is_not_a_value_object_is_flagged() =>
        Harness<UnmarkedDomainTypeAnalyzer>.Verify(UnmarkedValueObject);

    [Fact]
    public Task A_nullable_unmarked_member_is_flagged_through_the_nullable() =>
        Harness<UnmarkedDomainTypeAnalyzer>.Verify(NullableUnmarked);

    [Fact]
    public Task Primitives_enums_ids_and_entity_navigations_report_nothing() =>
        Harness<UnmarkedDomainTypeAnalyzer>.Verify(AllowedState);

    // A persisted entity whose only complex state is a marked value object — the shape the rule blesses.
    private const string Valid = """
        using System;

        public class DbSet<T> { }
        public class DbContext { }

        [Entity]
        public class Wallet
        {
            public Guid Id { get; private set; }
            public string Name { get; private set; }
            public Money Balance { get; private set; }
        }

        [ValueObject]
        public sealed record Money { public static Result<Money> From(decimal v) => new Result<Money>(); }

        public class AppDb : DbContext
        {
            public DbSet<Wallet> Wallets { get; set; }
        }

        public sealed class EntityAttribute : Attribute { }
        public sealed class ValueObjectAttribute : Attribute { }
        public struct Result<T> { }
        """;

    // A table whose row type forgot [Entity] — the anemic-User bug. Reported at the type declaration.
    private const string UnmarkedEntity = """
        using System;

        public class DbSet<T> { }
        public class DbContext { }

        public class {|SKY0021:User|}
        {
            public Guid Id { get; set; }
        }

        public class AppDb : DbContext
        {
            public DbSet<User> Users { get; set; }
        }

        public struct Result<T> { }
        """;

    // A complex member of an entity that should be a value object but carries no mark — reported at the property.
    private const string UnmarkedValueObject = """
        using System;

        [Entity]
        public class Agency
        {
            public Guid Id { get; private set; }
            public Address {|SKY0021:Address|} { get; private set; }
        }

        public sealed record Address(string Street);

        public sealed class EntityAttribute : Attribute { }
        public struct Result<T> { }
        """;

    private const string NullableUnmarked = """
        using System;

        [Entity]
        public class Agency
        {
            public Guid Id { get; private set; }
            public Address? {|SKY0021:BillingAddress|} { get; private set; }
        }

        public sealed record Address(string Street);

        public sealed class EntityAttribute : Attribute { }
        public struct Result<T> { }
        """;

    // Every legitimate kind of entity state: primitive, string, id, enum, a marked VO (incl. nullable), and a
    // collection navigation of another entity (referenced by the framework's own rules, not SKY0021's concern).
    private const string AllowedState = """
        using System;
        using System.Collections.Generic;

        [Entity]
        public class Agency
        {
            public Guid Id { get; private set; }
            public int Count { get; private set; }
            public string Name { get; private set; }
            public PersonType Kind { get; private set; }
            public Money Balance { get; private set; }
            public Money? Bonus { get; private set; }
            public IReadOnlyList<Department> Departments { get; private set; }
        }

        public enum PersonType { Individual, Company }

        [ValueObject]
        public sealed record Money { public static Result<Money> From(decimal v) => new Result<Money>(); }

        [Entity]
        public class Department { public Guid Id { get; private set; } }

        public sealed class EntityAttribute : Attribute { }
        public sealed class ValueObjectAttribute : Attribute { }
        public struct Result<T> { }
        """;
}
