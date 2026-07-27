using System.Collections.Immutable;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.SelfHarness;

/// <summary>
/// SKYSELF002 — keeps comments in the Skies libraries to documentation worth reading. It
/// rejects tracking codes (the kind that pair capital letters with a number) and scratch
/// markers such as TODO, FIXME, HACK and XXX, so the source stays something a .NET reviewer
/// would be proud to read rather than a scratchpad of materialized thoughts. Work is tracked
/// outside the source, not buried in it.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class CommentHygieneAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported when a comment contains a banned marker.</summary>
    public const string DiagnosticId = "SKYSELF002";

    private static readonly Regex Banned = new(
        @"\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b|\b[A-Z]{2,}-\d+\b",
        RegexOptions.Compiled);

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Comment contains a banned marker",
        messageFormat: "Comment contains '{0}'. Keep comments to documentation; track work outside the source.",
        category: "Skies.Framework.SelfHarness",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Tracking codes and scratch markers do not belong in committed source.");

    /// <summary>The single rule this analyzer reports.</summary>
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <summary>Registers the per-file comment scan.</summary>
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxTreeAction(AnalyzeTree);
    }

    private static void AnalyzeTree(SyntaxTreeAnalysisContext context)
    {
        var root = context.Tree.GetRoot(context.CancellationToken);
        foreach (var trivia in root.DescendantTrivia())
        {
            if (!IsComment(trivia.Kind()))
                continue;

            var match = Banned.Match(trivia.ToString());
            if (match.Success)
                context.ReportDiagnostic(Diagnostic.Create(Rule, trivia.GetLocation(), match.Value));
        }
    }

    private static bool IsComment(SyntaxKind kind) => kind
        is SyntaxKind.SingleLineCommentTrivia
        or SyntaxKind.MultiLineCommentTrivia
        or SyntaxKind.SingleLineDocumentationCommentTrivia
        or SyntaxKind.MultiLineDocumentationCommentTrivia;
}
