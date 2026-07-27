using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0002 — an endpoint stays thin. A Minimal API route (<c>MapGet</c>, <c>MapPost</c>, …)
/// delegates to a slice's handler and maps the result; it carries no business logic inline.
/// The checkable form of "thin" is syntactic, the same expression-versus-block trigger the
/// convention uses everywhere: the route handler is an expression-bodied lambda or a method
/// group, never a statement block. A block body is where branching and rules leak into the
/// HTTP boundary — the "business logic in routes" drift observed in the corbanx pilot. The
/// fix is always the same: move the statements into the slice's <c>Handle</c>.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class EndpointThinnessAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for a route handler that carries an inline block.</summary>
    public const string DiagnosticId = "SKY0002";

    private static readonly ImmutableHashSet<string> MapMethods = ImmutableHashSet.Create(
        "MapGet", "MapPost", "MapPut", "MapDelete", "MapPatch", "MapMethods");

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Endpoint must stay thin",
        messageFormat: "A {0} route handler contains a statement block; move the logic into the slice's Handle and keep the route an expression",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "A Minimal API route handler must be an expression-bodied lambda or a method group, "
                   + "never a statement block. Business logic belongs in the slice's Handle, not the route.");

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
        if (!MapMethods.Contains(member.Name.Identifier.Text))
            return;

        var handler = invocation.ArgumentList.Arguments.Count > 0
            ? invocation.ArgumentList.Arguments[invocation.ArgumentList.Arguments.Count - 1].Expression
            : null;

        var block = handler switch
        {
            ParenthesizedLambdaExpressionSyntax { Body: BlockSyntax body } => body,
            SimpleLambdaExpressionSyntax { Body: BlockSyntax body } => body,
            _ => null,
        };

        if (block is not null)
            context.ReportDiagnostic(Diagnostic.Create(Rule, block.GetLocation(), member.Name.Identifier.Text));
    }
}
