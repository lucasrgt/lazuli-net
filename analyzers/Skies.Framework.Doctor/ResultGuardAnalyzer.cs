using System;
using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0025 — <b>a held <c>Result&lt;T&gt;</c> is checked before it is unwrapped</b>. Reading <c>.Value</c> on a
/// failure (or <c>.Error</c> on a success) throws — so unwrapping a result that was stored in a local or
/// parameter without any earlier outcome check in the same member (<c>IsSuccess</c> / <c>IsFailure</c>, or
/// folding it through <c>Validation.Collect</c>) is the type's number-one misuse, flagged here. Unwrapping
/// <em>inline</em> on a fresh construction (<c>Money.From(10m).Value</c> in a seed or test, where the input is
/// known valid) stays legal: holding a result and never looking at its outcome is the bug; asserting a known
/// literal is an idiom. <c>.Tests.cs</c> files are exempt entirely (the same carve-out as SKY0009): in a test an
/// unguarded unwrap failing IS the signal — the exception fails the test with a stack trace, which is exactly
/// the behaviour a test wants, and forcing an <c>IsSuccess</c> assert before every read is ceremony.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class ResultGuardAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported when a stored result is unwrapped with no preceding outcome check.</summary>
    public const string DiagnosticId = "SKY0025";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Check a Result before unwrapping it",
        messageFormat: "'{0}.{1}' is read but '{0}' is never checked first — test IsSuccess/IsFailure (or fold "
                     + "it through Validation.Collect) before unwrapping; on the wrong outcome this access throws",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Reading Result<T>.Value on a failure (or .Error on a success) throws. A result held in a "
                   + "local or parameter must have its outcome checked earlier in the same member — "
                   + "IsSuccess/IsFailure, or Validation.Collect — before being unwrapped.");

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(AnalyzeAccess, SyntaxKind.SimpleMemberAccessExpression);
    }

    private static void AnalyzeAccess(SyntaxNodeAnalysisContext context)
    {
        var access = (MemberAccessExpressionSyntax)context.Node;
        var member = access.Name.Identifier.Text;
        if (member is not ("Value" or "Error"))
            return;

        // A test wants the throw: an unguarded unwrap failing fails the test with a stack trace — the signal,
        // not the bug. Same carve-out as SKY0009.
        if (access.SyntaxTree.FilePath.EndsWith(".Tests.cs", StringComparison.Ordinal))
            return;

        // Only a *held* result is in scope: unwrapping inline on a fresh construction is the deliberate
        // known-valid idiom (seeds, tests), not the dropped-check bug this rule exists for.
        if (access.Expression is not IdentifierNameSyntax receiver)
            return;

        if (context.SemanticModel.GetTypeInfo(access.Expression, context.CancellationToken).Type
                is not INamedTypeSymbol { Name: "Result", Arity: 1 })
            return;

        var scope = (SyntaxNode?)access.Ancestors()
                .FirstOrDefault(n => n is BaseMethodDeclarationSyntax
                                       or LocalFunctionStatementSyntax
                                       or BasePropertyDeclarationSyntax)
            ?? access.SyntaxTree.GetRoot(context.CancellationToken);

        var name = receiver.Identifier.Text;
        if (!CheckedBefore(scope, name, access.SpanStart))
            context.ReportDiagnostic(Diagnostic.Create(
                Rule, access.Name.GetLocation(), name, member));
    }

    // True when, earlier in the same member, the result's outcome was consulted: an IsSuccess/IsFailure read,
    // a `Validation.Collect(…, result)` fold, or an `is`-pattern over those properties — including the
    // declaring form, where the name is BORN inside the check (`if (X.From(…) is not { IsSuccess: true } r)
    // return …;` — `r` only flows past the guard on the success path).
    private static bool CheckedBefore(SyntaxNode scope, string name, int position) =>
        scope.DescendantNodes()
            .Where(node => node.SpanStart < position)
            .Any(node => node switch
            {
                MemberAccessExpressionSyntax { Expression: IdentifierNameSyntax id } check =>
                    id.Identifier.Text == name
                    && check.Name.Identifier.Text is "IsSuccess" or "IsFailure",
                InvocationExpressionSyntax { Expression: MemberAccessExpressionSyntax fold } collect =>
                    fold.Name.Identifier.Text == "Collect"
                    && collect.ArgumentList.Arguments
                        .Any(arg => arg.Expression is IdentifierNameSyntax argId
                                 && argId.Identifier.Text == name),
                IsPatternExpressionSyntax pattern =>
                    (pattern.Expression is IdentifierNameSyntax patId && patId.Identifier.Text == name
                     || DeclaresName(pattern.Pattern, name))
                    && ConsultsOutcome(pattern.Pattern),
                _ => false,
            });

    private static bool DeclaresName(PatternSyntax pattern, string name) =>
        pattern.DescendantNodesAndSelf()
            .OfType<SingleVariableDesignationSyntax>()
            .Any(d => d.Identifier.Text == name);

    private static bool ConsultsOutcome(PatternSyntax pattern) =>
        pattern.DescendantNodesAndSelf()
            .OfType<SubpatternSyntax>()
            .Any(sub => sub.NameColon?.Name.Identifier.Text is "IsSuccess" or "IsFailure"
                     || (sub.ExpressionColon?.Expression as IdentifierNameSyntax)?.Identifier.Text
                            is "IsSuccess" or "IsFailure");
}
