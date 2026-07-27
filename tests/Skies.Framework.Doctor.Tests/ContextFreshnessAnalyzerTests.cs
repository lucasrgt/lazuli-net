using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class ContextFreshnessAnalyzerTests
{
    [Fact]
    public Task Citations_that_resolve_report_nothing() =>
        // `Login` is in source; `Guid` is in a referenced assembly — both resolve, so the ctx is fresh.
        Make("""
            # account

            ## Boundaries

            - in/out

            ## Design notes

            `Login` issues a token; ids are `Guid`.
            """).RunAsync();

    [Fact]
    public Task A_dangling_citation_is_flagged()
    {
        var test = Make("""
            # account

            ## Boundaries

            - x

            ## Design notes

            The `AttachCtx` hook is gone.
            """);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(ContextFreshnessAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Account.ctx.md", 9, 6, 9, 15)
                .WithArguments("Account.ctx.md", "AttachCtx"));
        return test.RunAsync();
    }

    [Fact]
    public Task A_journey_cited_in_the_ctx_resolves_against_the_co_located_tests_file()
    {
        // `PromotionJourney` is a [Journey] class in a *.Tests.cs — <Compile Remove>'d from this compilation,
        // fed to the doctor as an AdditionalFile. The api compilation holds no symbol for it, yet the ctx may
        // legitimately name the journey that covers the module; resolving against the AdditionalFile keeps it
        // fresh instead of the false "no longer exists" a pilot hit.
        var test = Make("""
            # account

            ## Boundaries

            - x

            ## Design notes

            Sign-up is covered by `PromotionJourney`.
            """);
        test.TestState.AdditionalFiles.Add(("PromotionJourney.Tests.cs", """
            namespace Demo.Journeys;

            [Journey]
            public class PromotionJourney { }
            """));
        return test.RunAsync();
    }

    [Fact]
    public Task A_citation_absent_from_the_tests_file_is_still_flagged()
    {
        // The co-located-tests source must resolve only names it actually declares — a present *.Tests.cs
        // does not blanket-pass every citation, or freshness would rot.
        var test = Make("""
            # account

            ## Boundaries

            - x

            ## Design notes

            The `GhostJourney` is gone.
            """);
        test.TestState.AdditionalFiles.Add(("PromotionJourney.Tests.cs", """
            namespace Demo.Journeys;

            [Journey]
            public class PromotionJourney { }
            """));
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(ContextFreshnessAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Account.ctx.md", 9, 6, 9, 18)
                .WithArguments("Account.ctx.md", "GhostJourney"));
        return test.RunAsync();
    }

    private const string Source = """
        namespace Demo.Modules.Account;

        [Slice]
        class Login { }

        sealed class SliceAttribute : System.Attribute { }
        """;

    private static CSharpAnalyzerTest<ContextFreshnessAnalyzer, DefaultVerifier> Make(string ctx) =>
        new()
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState =
            {
                Sources = { ("Login.cs", Source) },
                AdditionalFiles = { ("Account.ctx.md", ctx) },
            },
        };
}
