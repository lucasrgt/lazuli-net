using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class SkippedTestAnalyzerTests
{
    [Fact]
    public Task A_skipped_fact_is_rejected()
    {
        var test = Make("""
            using System;

            class Tests
            {
                [Fact(Skip = "later")]
                public void Required_path() { }
            }

            sealed class FactAttribute : Attribute
            {
                public string? Skip { get; set; }
            }
            """);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(SkippedTestAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Tests.cs", 5, 6, 5, 26)
                .WithArguments("Required_path", "Tests.cs"));
        return test.RunAsync();
    }

    [Fact]
    public Task A_skip_in_an_additional_test_file_is_rejected()
    {
        var test = Make("class Production { }");
        test.TestState.AdditionalFiles.Add(("CheckoutJourney.Tests.cs", """
            [Fact(Skip = "backend unavailable")]
            public void Checkout() { }
            """));
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(SkippedTestAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithArguments("CheckoutJourney.Tests", "CheckoutJourney.Tests.cs"));
        return test.RunAsync();
    }

    [Theory]
    [InlineData("SkipWhen = \"IsOffline\"")]
    [InlineData("SkipUnless = \"HasBrowser\"")]
    [InlineData("Explicit = true")]
    public Task Conditional_and_explicit_xunit_switches_are_rejected(string switchExpression)
    {
        var test = Make($$"""
            using System;

            class Tests
            {
                [Fact({{switchExpression}})]
                public void Required_path() { }
            }

            sealed class FactAttribute : Attribute
            {
                public string? SkipWhen { get; set; }
                public string? SkipUnless { get; set; }
                public bool Explicit { get; set; }
            }
            """);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(SkippedTestAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Tests.cs", 5, 6, 5, 12 + switchExpression.Length)
                .WithArguments("Required_path", "Tests.cs"));
        return test.RunAsync();
    }

    [Fact]
    public Task Prose_mentioning_skip_is_not_an_attribute() =>
        Make("""
            // Never ship [Fact(Skip = "later")].
            class Production { }
            """).RunAsync();

    private static CSharpAnalyzerTest<SkippedTestAnalyzer, DefaultVerifier> Make(string source) => new()
    {
        ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
        CompilerDiagnostics = CompilerDiagnostics.Errors,
        TestState = { Sources = { ("Tests.cs", source) } },
    };
}
