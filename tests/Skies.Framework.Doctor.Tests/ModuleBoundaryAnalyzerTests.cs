using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class ModuleBoundaryAnalyzerTests
{
    [Fact]
    public Task Writing_your_own_modules_entity_is_fine() =>
        Make("Own.cs", """
            namespace Demo.Modules.Account;

            class RegisterSlice
            {
                void Do(Demo.AppDb db) => db.Users.Add(null!);
            }
            """).RunAsync();

    [Fact]
    public Task Reading_another_modules_entity_is_fine() =>
        // A cross-module read (not a write method) — allowed in the modular monolith.
        Make("Read.cs", """
            namespace Demo.Modules.Host;

            class HomeSlice
            {
                void Do(Demo.AppDb db) { var _ = db.Users.Find(); }
            }
            """).RunAsync();

    [Fact]
    public Task Writing_another_modules_entity_is_flagged()
    {
        var test = Make("Bad.cs", """
            namespace Demo.Modules.Host;

            class BadSlice
            {
                void Do(Demo.AppDb db) => db.Users.Add(null!);
            }
            """);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(ModuleBoundaryAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Bad.cs", 5, 40, 5, 43)
                .WithArguments("Host", "Account", "User"));
        return test.RunAsync();
    }

    [Fact]
    public Task A_test_file_may_write_any_module() =>
        // Integration/unit tests legitimately seed another module's data; the rule guards production.
        Make("Seed.Tests.cs", """
            namespace Demo.Tests.Modules.Host;

            class Seeder
            {
                void Do(Demo.AppDb db) => db.Users.Add(null!);
            }
            """).RunAsync();

    [Fact]
    public Task Writing_another_modules_entity_through_the_untyped_context_is_flagged()
    {
        // The DbContext.Add(entity) form must not be a bypass of the DbSet rule.
        var test = Make("Untyped.cs", """
            namespace Demo.Modules.Host;

            class BadSlice
            {
                void Do(Demo.AppDb db) => db.Add(new Demo.Modules.Account.User());
            }
            """);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(ModuleBoundaryAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Untyped.cs", 5, 34, 5, 37)
                .WithArguments("Host", "Account", "User"));
        return test.RunAsync();
    }

    [Fact]
    public Task Writing_your_own_entity_through_the_untyped_context_is_fine() =>
        Make("UntypedOwn.cs", """
            namespace Demo.Modules.Host;

            class FineSlice
            {
                void Do(Demo.AppDb db) => db.Add(new Profile());
            }
            """).RunAsync();

    // Stub DbSet/DbContext + two modules' entities + the shared AppDb (no EF package needed — the analyzer
    // keys on the type names + namespace).
    private const string Harness = """
        namespace Microsoft.EntityFrameworkCore
        {
            public class DbSet<T> { public void Add(T e) { } public T Find() => default!; }
            public class DbContext { public void Add(object e) { } }
        }
        namespace Demo.Modules.Account { public class User { } }
        namespace Demo.Modules.Host { public class Profile { } }
        namespace Demo
        {
            public class AppDb : Microsoft.EntityFrameworkCore.DbContext
            {
                public Microsoft.EntityFrameworkCore.DbSet<Demo.Modules.Account.User> Users => new();
                public Microsoft.EntityFrameworkCore.DbSet<Demo.Modules.Host.Profile> Profiles => new();
            }
        }
        """;

    private static CSharpAnalyzerTest<ModuleBoundaryAnalyzer, DefaultVerifier> Make(string sliceFile, string sliceSource) =>
        new()
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.None,
            TestState =
            {
                Sources = { ("Harness.cs", Harness), (sliceFile, sliceSource) },
            },
        };
}
