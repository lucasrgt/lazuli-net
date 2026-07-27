using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class SliceCriterionAnalyzerTests
{
    [Fact]
    public Task Slice_declared_with_a_criterion_reports_nothing() =>
        Make(PlainSlice, Manifest).RunAsync();

    [Fact]
    public Task Slice_with_no_manifest_is_flagged()
    {
        var test = Make(PlainSlice, manifest: null);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(SliceCriterionAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 6, 7, 6, 14)
                .WithArguments("Deposit", "Wallets.spec.toml"));
        return test.RunAsync();
    }

    [Fact]
    public Task Slice_declared_with_no_criteria_is_flagged()
    {
        // The manifest declares the slice's table but lists no criteria — still a gap on the criterion axis.
        var test = Make(PlainSlice, EmptyManifest);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(SliceCriterionAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 6, 7, 6, 14)
                .WithArguments("Deposit", "Wallets.spec.toml"));
        return test.RunAsync();
    }

    [Fact]
    public Task Plain_slice_with_no_criterion_is_flagged()
    {
        var test = Make(PlainSlice, manifest: null);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(SliceCriterionAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 6, 7, 6, 14)
                .WithArguments("Deposit", "Wallets.spec.toml"));
        return test.RunAsync();
    }

    private const string PlainSlice = """
        using System;

        namespace App.Modules.Wallets;

        [Slice]
        class Deposit { }

        sealed class SliceAttribute : Attribute { }
        """;

    // Declares the slice with a criterion — closes the SKY0031 obligation.
    private const string Manifest = """
        module = "Wallets"

        [slices.Deposit]
        criteria = ["own-resource-only"]
        """;

    // Declares the slice's table but with an empty criteria array — does not satisfy SKY0031.
    private const string EmptyManifest = """
        module = "Wallets"

        [slices.Deposit]
        criteria = []
        """;

    // Builds the analyzer test from the slice source and its optional module manifest AdditionalFile.
    private static CSharpAnalyzerTest<SliceCriterionAnalyzer, DefaultVerifier> Make(
        string source, string? manifest)
    {
        var test = new CSharpAnalyzerTest<SliceCriterionAnalyzer, DefaultVerifier>
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState = { Sources = { ("Deposit.cs", source) } },
        };
        if (manifest is not null)
            test.TestState.AdditionalFiles.Add(("Wallets.spec.toml", manifest));
        return test;
    }
}
