using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0012 — a <c>[Slice]</c>'s <c>Map</c> must name its endpoint after the slice:
/// <c>.WithName("&lt;SliceName&gt;")</c> (or <c>.WithName(nameof(&lt;SliceName&gt;))</c>). That name becomes the
/// OpenAPI <c>operationId</c>, which the typed client generator turns into the hook name — so the contract of
/// the <c>Handle</c> becomes the name of the wire, and the generated frontend hook is <c>use&lt;SliceName&gt;</c>
/// rather than a path-derived guess. Without it the client mirror drifts slice-by-slice; with it the 1:1 holds
/// by construction. (A slice missing its <c>Map</c> entirely is SKY0001's concern, not this rule's.)
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class EndpointNameAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported when a slice's endpoint is not named after the slice.</summary>
    public const string DiagnosticId = "SKY0012";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Slice endpoint must be named after the slice",
        messageFormat: "Slice '{0}' must name its endpoint .WithName(\"{0}\") so the generated client hook is use{0}",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "A [Slice]'s Map must call .WithName(\"<SliceName>\") (or nameof) — the operationId the "
                   + "typed client generates its hook from, keeping the backend↔frontend names 1:1.");

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
        var map = cls.Members
            .OfType<MethodDeclarationSyntax>()
            .FirstOrDefault(m => m.Identifier.Text == "Map");
        if (map is null)
            return; // a missing Map is SKY0001's concern

        if (!NamesEndpointAfterSlice(map, name))
            context.ReportDiagnostic(Diagnostic.Create(Rule, cls.Identifier.GetLocation(), name));
    }

    // True if Map contains `.WithName("<name>")` or `.WithName(nameof(<name>))`.
    private static bool NamesEndpointAfterSlice(MethodDeclarationSyntax map, string name) =>
        map.DescendantNodes()
            .OfType<InvocationExpressionSyntax>()
            .Where(inv => inv.Expression is MemberAccessExpressionSyntax ma && ma.Name.Identifier.Text == "WithName")
            .SelectMany(inv => inv.ArgumentList.Arguments)
            .Any(arg => MatchesName(arg.Expression, name));

    private static bool MatchesName(ExpressionSyntax expr, string name) => expr switch
    {
        // .WithName("Slice")
        LiteralExpressionSyntax lit => lit.Token.ValueText == name,
        // .WithName(nameof(Slice))
        InvocationExpressionSyntax { Expression: IdentifierNameSyntax { Identifier.Text: "nameof" } } nameofCall =>
            nameofCall.ArgumentList.Arguments.Count == 1
            && nameofCall.ArgumentList.Arguments[0].Expression is IdentifierNameSyntax id
            && id.Identifier.Text == name,
        _ => false,
    };

    private static bool IsSlice(ClassDeclarationSyntax cls) =>
        cls.AttributeLists
            .SelectMany(list => list.Attributes)
            .Select(attr => attr.Name.ToString())
            .Any(n => n is "Slice" or "SliceAttribute"
                   || n.EndsWith(".Slice")
                   || n.EndsWith(".SliceAttribute"));
}
