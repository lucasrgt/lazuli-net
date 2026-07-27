using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Text;

namespace Skies.Framework.SelfHarness;

/// <summary>
/// SKYSELF001 — keeps every Skies library source file at or under 500 lines, the same
/// ceiling the Rails codebase holds itself to. A file that grows past it is the signal to
/// extract a concern into its own file, not to keep packing.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class FileSizeAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The maximum number of lines a single source file may contain.</summary>
    public const int MaxLines = 500;

    /// <summary>The identifier reported when a file exceeds <see cref="MaxLines"/>.</summary>
    public const string DiagnosticId = "SKYSELF001";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Source file exceeds the line ceiling",
        messageFormat: "File has {0} lines; the ceiling is {1}. Extract a concern into its own file.",
        category: "Skies.Framework.SelfHarness",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Skies library files stay at or under the ceiling so each holds a single, readable concern.");

    /// <summary>The single rule this analyzer reports.</summary>
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <summary>Registers the per-file line-count check.</summary>
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxTreeAction(AnalyzeTree);
    }

    private static void AnalyzeTree(SyntaxTreeAnalysisContext context)
    {
        var lineCount = context.Tree.GetText(context.CancellationToken).Lines.Count;
        if (lineCount <= MaxLines)
            return;

        var location = Location.Create(context.Tree, new TextSpan(0, 0));
        context.ReportDiagnostic(Diagnostic.Create(Rule, location, lineCount, MaxLines));
    }
}
