using System;
using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// <c>SKY0017</c> — the composition root stays a thin index. The application's top-level statements
/// (<c>Program.cs</c>) wire only the three named layers — <c>AddSkies</c> / <c>AddPlatform</c> /
/// <c>AddModules</c> and the matching <c>UseSkies</c> / <c>UsePlatform</c> / <c>MapModules</c>. Any other
/// service registration, request-pipeline step, or endpoint mapping there is drift: service registration belongs
/// in <c>AddPlatform</c> (cross-cutting infrastructure) or a module's <c>AddServices</c>; pipeline and endpoints
/// belong in <c>UsePlatform</c> and the modules. Without this, the index rots back into a dumping ground — the
/// thing the <c>[Module]</c>/<c>Platform</c> convention exists to prevent.
///
/// The rule classifies a call by what it extends — an <c>IServiceCollection</c> call is registration; a
/// <c>WebApplication</c> / <c>IApplicationBuilder</c> / <c>IEndpointRouteBuilder</c> call is pipeline/endpoints —
/// so it is precise about the receiver (configuration sources, host builder, and ordinary boot code are left
/// alone). It fires only inside the composition root: the file that carries the top-level statements.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class CompositionRootAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for infra wiring that leaked into the composition root.</summary>
    public const string DiagnosticId = "SKY0017";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Composition root must stay a thin index",
        messageFormat: "The composition root is an index — {0}",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Program.cs (the top-level statements) wires only AddSkies / AddPlatform / AddModules and "
                   + "the matching UseSkies / UsePlatform / MapModules. Service registration belongs in "
                   + "AddPlatform (cross-cutting) or a module's AddServices; pipeline and endpoint wiring belong "
                   + "in UsePlatform and the modules — so the composition root never drifts into a dumping ground.");

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(AnalyzeInvocation, SyntaxKind.InvocationExpression);
    }

    private static void AnalyzeInvocation(SyntaxNodeAnalysisContext context)
    {
        var invocation = (InvocationExpressionSyntax)context.Node;
        if (invocation.Expression is not MemberAccessExpressionSyntax member)
            return;

        // Only the composition root — the one file that carries the top-level statements.
        if (invocation.SyntaxTree.GetRoot(context.CancellationToken) is not CompilationUnitSyntax unit
            || !unit.Members.Any(node => node.IsKind(SyntaxKind.GlobalStatement)))
            return;

        if (context.SemanticModel.GetSymbolInfo(invocation, context.CancellationToken).Symbol is not IMethodSymbol method
            || method.ReceiverType is not { } receiver)
            return;

        var name = member.Name.Identifier.Text;
        var at = member.Name.GetLocation();

        if (IsServiceCollection(receiver))
        {
            if (name is not ("AddSkies" or "AddPlatform" or "AddModules"))
                Report(context, at,
                    $"move the registration '{name}' into AddPlatform (cross-cutting infrastructure) or a module's AddServices");
            return;
        }

        if (!IsAppPipeline(receiver))
            return;

        if (name.StartsWith("Use", StringComparison.Ordinal) && name is not ("UseSkies" or "UsePlatform"))
            Report(context, at, $"move '{name}' into UsePlatform (the platform's request pipeline)");
        else if (name.StartsWith("Map", StringComparison.Ordinal) && name != "MapModules")
            Report(context, at, $"map '{name}' in a module's Map, wired via MapModules");
    }

    // The DI container: registrations (AddX, Configure, …) extend IServiceCollection.
    private static bool IsServiceCollection(ITypeSymbol type) =>
        type.Name == "IServiceCollection" || type.AllInterfaces.Any(i => i.Name == "IServiceCollection");

    // The request pipeline + endpoints: Use*/Map* extend the app or its routing/middleware builders.
    private static bool IsAppPipeline(ITypeSymbol type) =>
        IsPipelineName(type.Name) || type.AllInterfaces.Any(i => IsPipelineName(i.Name));

    private static bool IsPipelineName(string name) =>
        name is "WebApplication" or "IApplicationBuilder" or "IEndpointRouteBuilder";

    private static void Report(SyntaxNodeAnalysisContext context, Location location, string problem) =>
        context.ReportDiagnostic(Diagnostic.Create(Rule, location, problem));
}
