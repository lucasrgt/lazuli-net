using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class EndpointNameAnalyzerTests
{
    [Fact]
    public Task Slice_naming_its_endpoint_after_itself_reports_nothing()
    {
        var test = new CSharpAnalyzerTest<EndpointNameAnalyzer, DefaultVerifier>
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState = { Sources = { ("Deposit.cs", Named) } },
        };
        return test.RunAsync();
    }

    [Fact]
    public Task Slice_whose_endpoint_is_unnamed_is_flagged()
    {
        var test = new CSharpAnalyzerTest<EndpointNameAnalyzer, DefaultVerifier>
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState = { Sources = { ("Deposit.cs", Unnamed) } },
        };
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(EndpointNameAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 4, 7, 4, 14)
                .WithArguments("Deposit"));
        return test.RunAsync();
    }

    // A slice whose Map names the endpoint after the slice (the convention) — compiles against a tiny stand-in
    // builder so the test needs no ASP.NET reference; the rule is syntax-based.
    private const string Named = """
        using System;

        [Slice]
        class Deposit
        {
            static void Map() { Builder().WithName("Deposit"); }
            static B Builder() => new B();
        }

        class B { public B WithName(string n) => this; }
        sealed class SliceAttribute : Attribute { }
        """;

    private const string Unnamed = """
        using System;

        [Slice]
        class Deposit
        {
            static void Map() { }
        }

        sealed class SliceAttribute : Attribute { }
        """;
}
