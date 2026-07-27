using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class VerifyProofAnalyzerTests
{
    [Fact]
    public Task Declared_criterion_proven_in_source_reports_nothing() =>
        Make(ProvenInSource, Manifest).RunAsync();

    [Fact]
    public Task Declared_criterion_proven_in_a_test_file_reports_nothing() =>
        Make(Slice, Manifest, AvpProofFile).RunAsync();

    [Fact]
    public Task Declared_criterion_without_any_avp_proof_is_flagged()
    {
        // The manifest declares the criterion for the slice, but nothing proves it — the bridge's gap.
        var test = Make(Slice, Manifest);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(VerifyProofAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 6, 7, 6, 14)
                .WithArguments("own-resource-only", "Deposit", "Wallets.spec.toml"));
        return test.RunAsync();
    }

    [Fact]
    public Task No_manifest_means_no_obligation_to_prove() =>
        // The obligation lives in the manifest; with none, SKY0030 has nothing to enforce.
        Make(Slice, manifest: null).RunAsync();

    // A [Slice] in a module (the namespace's last segment). The acceptance obligation lives in the
    // module's <Module>.spec.toml beside it, not on an inline attribute.
    private const string Slice = """
        using System;

        namespace App.Modules.Wallets;

        [Slice]
        class Deposit { }

        sealed class SliceAttribute : Attribute { }
        """;

    // The same slice with its AVP proof co-located in source.
    private const string ProvenInSource = """
        using System;

        namespace App.Modules.Wallets;

        [Slice]
        class Deposit { }

        class DepositProof
        {
            [AVP(typeof(Deposit), "own-resource-only")]
            public void Proves() { }
        }

        sealed class SliceAttribute : Attribute { }
        sealed class AVPAttribute : Attribute { public AVPAttribute(Type subject, string id) { } }
        """;

    // The module's Clockwork spec manifest declaring the slice's acceptance criterion.
    private const string Manifest = """
        module = "Wallets"

        [slices.Deposit]
        criteria = ["own-resource-only"]
        """;

    // The AVP proof living in an excluded test file — scanned as an AdditionalFile, never compiled.
    private const string AvpProofFile = """
        namespace App.Tests.Modules.Wallets;

        [AVP(typeof(Deposit), "own-resource-only")]
        public void Proves() { }
        """;

    // Builds the analyzer test: the slice source, the spec manifest (when given) and an optional AVP proof
    // file, both fed as AdditionalFiles exactly as the app opts in via `**\*.spec.toml` and `*.Tests.cs`.
    private static CSharpAnalyzerTest<VerifyProofAnalyzer, DefaultVerifier> Make(
        string source, string? manifest, string? proofs = null)
    {
        var test = new CSharpAnalyzerTest<VerifyProofAnalyzer, DefaultVerifier>
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState = { Sources = { ("Deposit.cs", source) } },
        };
        if (manifest is not null)
            test.TestState.AdditionalFiles.Add(("Wallets.spec.toml", manifest));
        if (proofs is not null)
            test.TestState.AdditionalFiles.Add(("DepositProof.Tests.cs", proofs));
        return test;
    }
}
