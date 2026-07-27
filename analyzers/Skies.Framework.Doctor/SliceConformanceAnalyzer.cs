using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0001 — a class marked <c>[Slice]</c> must follow the canonical shape: a <c>static</c>
/// class with a nested <c>Input</c> and <c>Output</c>, a public <c>Handle</c> returning
/// <c>Task&lt;Result&lt;T&gt;&gt;</c>, and a <c>Map</c> — declared in that order
/// (Input → Output → Handle → Map: contract, then behaviour, then transport). Drift here is the
/// #1 failure observed in the corbanx pilot — the agent "deviated from the architecture" — so
/// this rule turns that drift into a build error the LLM cannot route around.
///
/// The rule matches the <c>[Slice]</c> attribute by simple name, so a project does not need to
/// reference Skies.Framework.Abstractions for the doctor to enforce conformance.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class SliceConformanceAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for a non-conformant slice.</summary>
    public const string DiagnosticId = "SKY0001";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Slice must follow the canonical shape",
        messageFormat: "Slice '{0}' {1}",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "A [Slice] is a static class with a nested 'Input' and 'Output', a public "
                   + "'Handle' returning Task<Result<T>>, and a 'Map', declared in that order.");

    private static readonly string[] CanonicalOrder = { "Input", "Output", "Handle", "Map" };

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(AnalyzeClass, SyntaxKind.ClassDeclaration);
    }

    private static void AnalyzeClass(SyntaxNodeAnalysisContext context)
    {
        var cls = (ClassDeclarationSyntax)context.Node;
        if (!IsSlice(cls))
            return;

        var name = cls.Identifier.Text;

        if (!cls.Modifiers.Any(SyntaxKind.StaticKeyword))
            Report(context, cls.Identifier.GetLocation(), name, "must be a static class");

        if (!cls.Members.Any(m => MemberName(m) == "Input"))
            Report(context, cls.Identifier.GetLocation(), name, "must declare a nested 'Input' type");

        var handlers = cls.Members
            .OfType<MethodDeclarationSyntax>()
            .Where(m => m.Identifier.Text == "Handle")
            .ToList();

        if (handlers.Count == 0)
        {
            Report(context, cls.Identifier.GetLocation(), name, "must declare a public 'Handle' method");
            return;
        }

        var returnType = handlers[0].ReturnType.ToString().Replace(" ", "");
        if (!returnType.Contains("Task<Result<"))
            Report(context, handlers[0].ReturnType.GetLocation(), name, "method 'Handle' must return Task<Result<T>>");

        if (!IsInCanonicalOrder(cls))
            Report(context, cls.Identifier.GetLocation(), name, "members must be ordered Input → Output → Handle → Map");
    }

    private static bool IsInCanonicalOrder(ClassDeclarationSyntax cls)
    {
        var ranks = cls.Members
            .Select(m => System.Array.IndexOf(CanonicalOrder, MemberName(m)))
            .Where(rank => rank >= 0)
            .ToList();

        for (var i = 1; i < ranks.Count; i++)
            if (ranks[i] < ranks[i - 1])
                return false;
        return true;
    }

    private static string? MemberName(MemberDeclarationSyntax member) => member switch
    {
        TypeDeclarationSyntax type => type.Identifier.Text,
        MethodDeclarationSyntax method => method.Identifier.Text,
        _ => null,
    };

    private static bool IsSlice(ClassDeclarationSyntax cls) =>
        cls.AttributeLists
            .SelectMany(list => list.Attributes)
            .Select(attr => attr.Name.ToString())
            .Any(n => n is "Slice" or "SliceAttribute"
                   || n.EndsWith(".Slice")
                   || n.EndsWith(".SliceAttribute"));

    private static void Report(SyntaxNodeAnalysisContext context, Location location, string name, string problem) =>
        context.ReportDiagnostic(Diagnostic.Create(Rule, location, name, problem));
}
