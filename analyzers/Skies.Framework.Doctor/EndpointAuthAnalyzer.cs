using System.Collections.Concurrent;
using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Operations;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0022 — <b>an endpoint's authorization is a decision, never an omission</b>. Every <c>[Slice]</c> must carry
/// an explicit authorization posture: either its own <c>Map</c> chain calls <c>.RequireAuthorization(…)</c> /
/// <c>.AllowAnonymous()</c>, or the route group its <c>Map</c> is mounted on does (the
/// <c>app.MapGroup("/x").RequireAuthorization()</c> shape in the module's <c>Map</c>). A slice with neither is
/// flagged — the classic silent failure is a new endpoint that ships open because nobody decided anything.
/// <c>.AllowAnonymous()</c> is not a loophole: it is the same decision, made visible and reviewable.
/// (A slice missing its <c>Map</c> entirely is SKY0001's concern, not this rule's.)
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class EndpointAuthAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported when a slice's endpoint carries no explicit authorization decision.</summary>
    public const string DiagnosticId = "SKY0022";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Slice endpoint must declare its authorization decision",
        messageFormat: "Slice '{0}' declares no authorization decision — call .RequireAuthorization(…) (or an "
                     + "explicit .AllowAnonymous()) in its Map chain or on the route group it is mounted on",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Every [Slice] endpoint must state its authorization posture explicitly — "
                   + ".RequireAuthorization(…) or .AllowAnonymous() — on its own Map chain or on the module's "
                   + "route group, so an endpoint can never ship open by omission.",
        customTags: WellKnownDiagnosticTags.CompilationEnd);

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterCompilationStartAction(Analyze);
    }

    // The decision can live in two places (the slice's own chain, or the group it is mounted on in the module),
    // so the rule needs the whole compilation: collect every slice, mark the ones that decided, and flag the
    // rest at compilation end.
    private static void Analyze(CompilationStartAnalysisContext context)
    {
        var undecided = new ConcurrentDictionary<INamedTypeSymbol, Location>(SymbolEqualityComparer.Default);
        var covered = new ConcurrentDictionary<INamedTypeSymbol, byte>(SymbolEqualityComparer.Default);

        context.RegisterSymbolAction(symbolContext =>
        {
            var type = (INamedTypeSymbol)symbolContext.Symbol;
            if (!HasSliceAttribute(type) || type.Locations.FirstOrDefault() is not { } location)
                return;
            var map = type.GetMembers("Map").OfType<IMethodSymbol>().FirstOrDefault();
            if (map is null)
                return; // a missing Map is SKY0001's concern
            var decidedInOwnChain = map.DeclaringSyntaxReferences
                .Select(r => r.GetSyntax(symbolContext.CancellationToken))
                .Any(ContainsAuthDecision);
            if (!decidedInOwnChain)
                undecided.TryAdd(type, location);
        }, SymbolKind.NamedType);

        context.RegisterOperationAction(opContext =>
        {
            var invocation = (IInvocationOperation)opContext.Operation;
            var method = invocation.TargetMethod;
            if (method.Name != "Map" || method.ContainingType is not { } slice || !HasSliceAttribute(slice))
                return;
            if (invocation.Syntax is InvocationExpressionSyntax syntax && CallSiteDecides(syntax))
                covered.TryAdd(slice, 0);
        }, OperationKind.Invocation);

        context.RegisterCompilationEndAction(endContext =>
        {
            foreach (var slice in undecided)
                if (!covered.ContainsKey(slice.Key))
                    endContext.ReportDiagnostic(Diagnostic.Create(Rule, slice.Value, slice.Key.Name));
        });
    }

    // True when the call site mounts the slice on an authorization-decided builder: the argument either carries
    // the decision inline (`Deposit.Map(app.MapGroup("/x").RequireAuthorization())`) or is a local whose group
    // was decided in the same method (`var g = app.MapGroup("/x").RequireAuthorization(); Deposit.Map(g);` — or
    // a later `g.RequireAuthorization();` statement).
    private static bool CallSiteDecides(InvocationExpressionSyntax invocation) =>
        invocation.ArgumentList.Arguments.Any(arg => arg.Expression switch
        {
            IdentifierNameSyntax id => LocalGroupDecides(invocation, id.Identifier.Text),
            var expr => ContainsAuthDecision(expr),
        });

    private static bool LocalGroupDecides(InvocationExpressionSyntax invocation, string local)
    {
        var body = invocation.Ancestors()
            .FirstOrDefault(n => n is BaseMethodDeclarationSyntax or LocalFunctionStatementSyntax);
        if (body is null)
            return false;

        var declaratorDecides = body.DescendantNodes()
            .OfType<VariableDeclaratorSyntax>()
            .Any(d => d.Identifier.Text == local
                   && d.Initializer is { } init
                   && ContainsAuthDecision(init.Value));
        if (declaratorDecides)
            return true;

        return body.DescendantNodes()
            .OfType<ExpressionStatementSyntax>()
            .Any(s => ContainsAuthDecision(s.Expression)
                   && s.Expression.DescendantNodes().OfType<IdentifierNameSyntax>()
                       .Any(id => id.Identifier.Text == local));
    }

    private static bool ContainsAuthDecision(SyntaxNode node) =>
        node.DescendantNodesAndSelf()
            .OfType<InvocationExpressionSyntax>()
            .Any(inv => inv.Expression is MemberAccessExpressionSyntax ma
                     && ma.Name.Identifier.Text is "RequireAuthorization" or "AllowAnonymous");

    private static bool HasSliceAttribute(INamedTypeSymbol type) =>
        type.GetAttributes().Any(a => a.AttributeClass?.Name is "Slice" or "SliceAttribute");
}
