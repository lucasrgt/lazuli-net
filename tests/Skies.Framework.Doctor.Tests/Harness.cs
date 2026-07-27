using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

// Runs an analyzer against a markup source: `{|SKYxxxx:text|}` marks an expected diagnostic at that
// span; unmarked source must produce none. Pinned to the .NET 8 reference set so the sample sources
// compile (the analyzers are mostly syntactic, so the references only need to make the stubs build).
internal static class Harness<TAnalyzer>
    where TAnalyzer : DiagnosticAnalyzer, new()
{
    public static Task Verify(string markup) => Run(markup, OutputKind.DynamicallyLinkedLibrary);

    // For composition-root rules: compiles the markup as a console app so top-level statements are legal.
    public static Task VerifyProgram(string markup) => Run(markup, OutputKind.ConsoleApplication);

    private static Task Run(string markup, OutputKind outputKind)
    {
        var test = new CSharpAnalyzerTest<TAnalyzer, DefaultVerifier>
        {
            TestCode = markup,
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
        };
        if (outputKind == OutputKind.ConsoleApplication)
            test.SolutionTransforms.Add((solution, projectId) =>
            {
                var options = (CSharpCompilationOptions)solution.GetProject(projectId)!.CompilationOptions!;
                return solution.WithProjectCompilationOptions(projectId, options.WithOutputKind(outputKind));
            });
        return test.RunAsync();
    }
}
