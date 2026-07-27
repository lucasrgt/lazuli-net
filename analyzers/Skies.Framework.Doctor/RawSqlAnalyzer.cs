using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0024 — <b>raw SQL never absorbs runtime values as text</b>. A <c>*Raw</c> EF Core call
/// (<c>FromSqlRaw</c>, <c>ExecuteSqlRaw</c>/<c>Async</c>, <c>SqlQueryRaw</c>) whose SQL argument is an
/// interpolated string with holes, or a concatenation involving a non-literal, splices runtime values into the
/// SQL text — the SQL-injection shape. The fix is one token away: <c>FromSql</c> / <c>ExecuteSql</c> /
/// <c>SqlQuery</c> take the same interpolated string and turn every hole into a <c>DbParameter</c>. A constant
/// SQL string passed to a <c>*Raw</c> method is fine and not flagged.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class RawSqlAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported when raw SQL splices runtime values into the query text.</summary>
    public const string DiagnosticId = "SKY0024";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Raw SQL must not splice runtime values into the query text",
        messageFormat: "'{0}' receives SQL built from runtime values — use the parameterizing twin ('{1}'), "
                     + "which turns every interpolation hole into a DbParameter",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "An EF Core *Raw call whose SQL argument interpolates or concatenates runtime values is "
                   + "the SQL-injection shape. FromSql/ExecuteSql/SqlQuery accept the same interpolated string "
                   + "and parameterize every hole — same code, no injection surface.");

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

        var name = member.Name.Identifier.Text;
        var safeTwin = name switch
        {
            "FromSqlRaw" => "FromSql",
            "ExecuteSqlRaw" => "ExecuteSql",
            "ExecuteSqlRawAsync" => "ExecuteSqlAsync",
            "SqlQueryRaw" => "SqlQuery",
            _ => null,
        };
        if (safeTwin is null)
            return;

        if (invocation.ArgumentList.Arguments.Any(arg => SplicesRuntimeValues(arg.Expression)))
            context.ReportDiagnostic(Diagnostic.Create(
                Rule, member.Name.GetLocation(), name, safeTwin));
    }

    // The SQL-injection shape: an interpolated string with at least one hole, or a `+` chain where any operand
    // is not itself a literal. A plain literal (or a concat of literals) carries no runtime value and is fine.
    private static bool SplicesRuntimeValues(ExpressionSyntax expression) => expression switch
    {
        InterpolatedStringExpressionSyntax interpolated =>
            interpolated.Contents.OfType<InterpolationSyntax>().Any(),
        BinaryExpressionSyntax { RawKind: (int)SyntaxKind.AddExpression } concat =>
            ContainsNonLiteralOperand(concat),
        _ => false,
    };

    private static bool ContainsNonLiteralOperand(BinaryExpressionSyntax concat)
    {
        var left = concat.Left is BinaryExpressionSyntax { RawKind: (int)SyntaxKind.AddExpression } nested
            ? ContainsNonLiteralOperand(nested)
            : IsRuntimeValue(concat.Left);
        return left || IsRuntimeValue(concat.Right);
    }

    private static bool IsRuntimeValue(ExpressionSyntax operand) =>
        operand is not LiteralExpressionSyntax
        && !(operand is InterpolatedStringExpressionSyntax interpolated
             && !interpolated.Contents.OfType<InterpolationSyntax>().Any());
}
