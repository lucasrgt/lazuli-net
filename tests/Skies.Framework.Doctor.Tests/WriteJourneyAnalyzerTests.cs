using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class WriteJourneyAnalyzerTests
{
    [Fact]
    public Task Write_slice_with_both_journeys_reports_nothing() =>
        Make(WriteSlice, """
            [E2E]
            [Journey(typeof(Deposit), JourneyPath.Happy)]
            [Fact]
            public void Happy_path() { Assert.True(true); }

            [E2E]
            [Journey(typeof(Deposit), JourneyPath.Sad)]
            [Fact]
            public void Sad_path() { Assert.True(true); Assert.False(false); }
            """).RunAsync();

    [Fact]
    public Task Write_slice_missing_the_sad_journey_is_flagged()
    {
        var test = Make(WriteSlice, """
            [E2E]
            [Journey(typeof(Deposit), JourneyPath.Happy)]
            [Fact]
            public void Happy_path() { Assert.True(true); }
            """);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(WriteJourneyAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 4, 14, 4, 21)
                .WithArguments("Deposit", "Sad"));
        return test.RunAsync();
    }

    [Fact]
    public Task Read_slice_needs_no_write_journeys() =>
        Make(ReadSlice, "").RunAsync();

    [Fact]
    public Task A_save_makes_even_a_get_mapped_slice_a_write()
    {
        var test = Make(SavingGetSlice, """
            [E2E]
            [Journey(typeof(Deposit), JourneyPath.Sad)]
            [Fact]
            public void Sad_path() { Assert.True(true); Assert.False(false); }
            """);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(WriteJourneyAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 4, 14, 4, 21)
                .WithArguments("Deposit", "Happy"));
        return test.RunAsync();
    }

    [Theory]
    [InlineData("ExecuteUpdateAsync")]
    [InlineData("ExecuteDeleteAsync")]
    [InlineData("ExecuteSqlInterpolatedAsync")]
    public Task A_set_based_persistence_call_makes_even_a_get_mapped_slice_a_write(string method)
    {
        var source = SavingGetSlice.Replace("SaveChanges", method);
        var test = Make(source, "");
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(WriteJourneyAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 4, 14, 4, 21)
                .WithArguments("Deposit", "Happy"));
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(WriteJourneyAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 4, 14, 4, 21)
                .WithArguments("Deposit", "Sad"));
        return test.RunAsync();
    }

    [Fact]
    public Task An_ambiguous_slice_is_fail_closed_as_a_write()
    {
        var test = Make(AmbiguousSlice, "");
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(WriteJourneyAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 4, 14, 4, 21)
                .WithArguments("Deposit", "Happy"));
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(WriteJourneyAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 4, 14, 4, 21)
                .WithArguments("Deposit", "Sad"));
        return test.RunAsync();
    }

    private const string WriteSlice = """
        using System;

        [Slice]
        public class Deposit
        {
            public static void Map(Endpoints app) => app.MapPost();
        }
        """;

    private const string ReadSlice = """
        using System;

        [Slice]
        public class Deposit
        {
            public static void Map(Endpoints app) => app.MapGet();
        }
        """;

    private const string SavingGetSlice = """
        using System;

        [Slice]
        public class Deposit
        {
            public static void Handle(Database db) => db.SaveChanges();
            public static void Map(Endpoints app) => app.MapGet();
        }
        """;

    private const string AmbiguousSlice = """
        using System;

        [Slice]
        public class Deposit
        {
            public static void Map(Endpoints app) => app.MapCustom();
        }
        """;

    private static CSharpAnalyzerTest<WriteJourneyAnalyzer, DefaultVerifier> Make(
        string source, string journeys) =>
        new()
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState =
            {
                Sources =
                {
                    ("Harness.cs", """
                        sealed class SliceAttribute : System.Attribute { }
                        public sealed class Endpoints
                        {
                            public void MapGet() { }
                            public void MapPost() { }
                            public void MapCustom() { }
                        }
                        public sealed class Database
                        {
                            public void SaveChanges() { }
                            public void ExecuteUpdateAsync() { }
                            public void ExecuteDeleteAsync() { }
                            public void ExecuteSqlInterpolatedAsync() { }
                        }
                        """),
                    ("Deposit.cs", source),
                },
                AdditionalFiles = { ("WalletJourney.Tests.cs", "class WalletJourney\n{\n" + journeys + "\n}") },
            },
        };
}
