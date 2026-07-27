using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class JourneyAssertionAnalyzerTests
{
    [Fact]
    public Task A_journey_that_asserts_reports_nothing() =>
        Make("""
            public class WalletJourney
            {
                [E2E]
                [Journey(typeof(Deposit), JourneyPath.Happy)]
                [Fact]
                public void Deposits_land() { var r = Run(); Assert.True(r.IsSuccess); }
            }
            """).RunAsync();

    [Fact]
    public Task A_journey_delegating_to_a_verify_helper_reports_nothing() =>
        Make("""
            public class WalletJourney
            {
                [E2E]
                [Journey(typeof(Deposit), JourneyPath.Sad)]
                [Fact]
                public void Overdraft_is_rejected() { VerifyRejected(Run()); VerifyBalanceUnchanged(); }
            }
            """).RunAsync();

    [Fact]
    public Task A_journey_that_asserts_nothing_is_flagged()
    {
        var test = Make("""
            public class WalletJourney
            {
                [E2E]
                [Journey(typeof(Deposit), JourneyPath.Sad)]
                [Fact]
                public void Overdraft_does_nothing() { var r = Run(); }
            }
            """);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(JourneyAssertionAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("WalletJourney.Tests.cs", 4, 6, 4, 47)
                .WithArguments("Deposit", "Sad"));
        return test.RunAsync();
    }

    [Fact]
    public Task Stacked_journeys_on_one_method_are_rejected()
    {
        var test = Make("""
            public class WalletJourney
            {
                [E2E]
                [Journey(typeof(Deposit), JourneyPath.Happy)]
                [Journey(typeof(Withdraw), JourneyPath.Sad)]
                [Fact]
                public void Does_too_much() { Assert.True(true); Assert.False(false); }
            }
            """);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult("SKY0033", DiagnosticSeverity.Error)
                .WithSpan("WalletJourney.Tests.cs", 4, 6, 4, 49)
                .WithArguments("Deposit", "one test method must prove exactly one slice and one path"));
        return test.RunAsync();
    }

    [Fact]
    public Task A_sad_journey_with_only_the_rejection_assertion_is_flagged()
    {
        var test = Make("""
            public class WalletJourney
            {
                [E2E]
                [Journey(typeof(Deposit), JourneyPath.Sad)]
                [Fact]
                public void Overdraft_is_rejected() { Assert.True(Run().IsFailure); }
            }
            """);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(JourneyAssertionAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("WalletJourney.Tests.cs", 4, 6, 4, 47)
                .WithArguments("Deposit", "Sad"));
        return test.RunAsync();
    }

    [Fact]
    public Task A_unit_test_cannot_impersonate_a_journey()
    {
        var test = Make("""
            public class WalletJourney
            {
                [Unit]
                [Journey(typeof(Deposit), JourneyPath.Happy)]
                [Fact]
                public void Deposit_unit_test() { Assert.True(true); }
            }
            """);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult("SKY0033", DiagnosticSeverity.Error)
                .WithSpan("WalletJourney.Tests.cs", 4, 6, 4, 49)
                .WithArguments("Deposit", "the method must carry [E2E]"));
        return test.RunAsync();
    }

    // The analyzer reads journeys from AdditionalFiles (they're excluded from the app compilation), so the
    // source is a trivial stand-in and the journey text is the additional file.
    private static CSharpAnalyzerTest<JourneyAssertionAnalyzer, DefaultVerifier> Make(string journeys) =>
        new()
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState =
            {
                Sources = { ("Program.cs", "class P { }") },
                AdditionalFiles = { ("WalletJourney.Tests.cs", journeys) },
            },
        };
}
