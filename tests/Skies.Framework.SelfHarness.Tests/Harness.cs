using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.SelfHarness.Tests;

// Runs a self-harness analyzer against a markup source: `{|SKYSELFxxx:text|}` marks an expected
// diagnostic at that span; unmarked source must produce none.
internal static class Harness<TAnalyzer>
    where TAnalyzer : DiagnosticAnalyzer, new()
{
    public static Task Verify(string markup) =>
        new CSharpAnalyzerTest<TAnalyzer, DefaultVerifier>
        {
            TestCode = markup,
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
        }.RunAsync();
}
