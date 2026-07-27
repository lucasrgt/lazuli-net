using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class RequireSliceTestAnalyzerTests
{
    [Fact]
    public Task Slice_with_a_colocated_test_reports_nothing()
    {
        var test = new CSharpAnalyzerTest<RequireSliceTestAnalyzer, DefaultVerifier>
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState =
            {
                Sources = { ("Deposit.cs", Slice) },
                AdditionalFiles = { ("Deposit.Tests.cs", "// covered") },
            },
        };
        return test.RunAsync();
    }

    [Fact]
    public Task Slice_without_a_colocated_test_is_flagged()
    {
        var test = new CSharpAnalyzerTest<RequireSliceTestAnalyzer, DefaultVerifier>
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState = { Sources = { ("Deposit.cs", Slice) } },
        };
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(RequireSliceTestAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 4, 7, 4, 14)
                .WithArguments("Deposit", "Deposit.Tests.cs"));
        return test.RunAsync();
    }

    private const string Slice = """
        using System;

        [Slice]
        class Deposit { }

        sealed class SliceAttribute : Attribute { }
        """;
}
