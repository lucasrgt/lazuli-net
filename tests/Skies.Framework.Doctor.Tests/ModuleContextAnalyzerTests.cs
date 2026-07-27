using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class ModuleContextAnalyzerTests
{
    [Fact]
    public Task Module_with_a_conformant_ctx_reports_nothing() =>
        Make("Account.ctx.md", GoodCtx).RunAsync();

    [Fact]
    public Task Module_with_no_ctx_is_flagged()
    {
        var test = Make("README.md", "not a ctx file");
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(ModuleContextAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Login.cs", 4, 7, 4, 12)
                .WithArguments("Account",
                    "has no Account.ctx.md beside it; add one with a '## Boundaries' and a '## Design notes' section"));
        return test.RunAsync();
    }

    [Fact]
    public Task Ctx_missing_boundaries_is_flagged()
    {
        var test = Make("Account.ctx.md", DesignOnlyCtx);
        test.TestState.ExpectedDiagnostics.Add(Section("Boundaries"));
        return test.RunAsync();
    }

    [Fact]
    public Task Ctx_with_an_empty_design_notes_is_flagged()
    {
        var test = Make("Account.ctx.md", EmptyDesignCtx);
        test.TestState.ExpectedDiagnostics.Add(Section("Design notes"));
        return test.RunAsync();
    }

    private static DiagnosticResult Section(string section) =>
        new DiagnosticResult(ModuleContextAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
            .WithSpan("Login.cs", 4, 7, 4, 12)
            .WithArguments("Account", $"needs a non-empty '## {section}' section in Account.ctx.md");

    private const string Slice = """
        namespace Demo.Modules.Account;

        [Slice]
        class Login { }

        sealed class SliceAttribute : System.Attribute { }
        """;

    private const string GoodCtx = """
        # account

        ## Boundaries

        - Inside: identity
        - Outside: payments live elsewhere

        ## Design notes

        ### A rule
        Why it holds.
        """;

    private const string DesignOnlyCtx = """
        # account

        ## Design notes

        ### A rule
        Why it holds.
        """;

    private const string EmptyDesignCtx = """
        # account

        ## Boundaries

        - Inside: identity

        ## Design notes
        """;

    private static CSharpAnalyzerTest<ModuleContextAnalyzer, DefaultVerifier> Make(string ctxName, string ctx) =>
        new()
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState =
            {
                Sources = { ("Login.cs", Slice) },
                AdditionalFiles = { (ctxName, ctx) },
            },
        };
}
