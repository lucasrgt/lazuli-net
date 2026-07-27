using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0028 — <b>a paged order needs a unique tiebreaker</b>. <c>ToPageAsync</c> turns the order into page
/// boundaries (Skip/Take over ORDER BY); when no sort key is unique, rows that compare equal have no
/// defined order between queries — a row repeats on the next page and another vanishes, and only under
/// data that HAS ties (the pilot bug: <c>OrderByDescending(CreatedAt)</c> over same-timestamp reviews,
/// green doctor, flaky pages). The order is total when any key in the chain is the entity's primary key:
/// a member named <c>Id</c>, or the EF-conventional <c>{Entity}Id</c> declared on the queried entity
/// itself. A <b>foreign</b> <c>*Id</c> (<c>CustomerId</c> on a Wallet) is shared by many rows and earns
/// nothing. An ordering the analyzer cannot read — a pre-ordered local crossing the statement — stays
/// silent: the warn speaks only when it can see the keys.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class PageOrderTiebreakerAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported when a ToPageAsync ordering chain carries no unique key.</summary>
    public const string DiagnosticId = "SKY0028";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "A paged order needs a unique tiebreaker",
        messageFormat: "the order feeding ToPageAsync ends in '{0}' — not a unique key, so ties make page "
                     + "boundaries non-deterministic; append ThenBy(x => x.Id)",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Warning,
        isEnabledByDefault: true,
        description: "Skip/Take pages an ORDER BY: rows equal under the final sort key have no defined "
                   + "order, so they repeat and vanish between pages — invisibly, until real data has "
                   + "ties. End the chain with the entity's unique key (ThenBy(x => x.Id)).");

    private static readonly ImmutableHashSet<string> Orderings =
        ImmutableHashSet.Create("OrderBy", "OrderByDescending", "ThenBy", "ThenByDescending");

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(AnalyzeInvocation, Microsoft.CodeAnalysis.CSharp.SyntaxKind.InvocationExpression);
    }

    private static void AnalyzeInvocation(SyntaxNodeAnalysisContext context)
    {
        var invocation = (InvocationExpressionSyntax)context.Node;
        if (invocation.Expression is not MemberAccessExpressionSyntax member
            || member.Name.Identifier.Text != "ToPageAsync"
            || !InsideSlice(invocation))
            return;

        // Walk the fluent chain from ToPageAsync back to its root. The first ordering met is the FINAL
        // sort key (the one ties fall through to); any primary key anywhere in the chain makes the whole
        // order total, because nothing below a unique key ever ties.
        MemberAccessExpressionSyntax? final = null;
        string? finalKey = null;
        var expression = member.Expression;
        while (expression is InvocationExpressionSyntax { Expression: MemberAccessExpressionSyntax inner } step)
        {
            if (Orderings.Contains(inner.Name.Identifier.Text))
            {
                var key = KeyOf(step);
                if (IsUnique(key, context.SemanticModel))
                    return;
                if (final is null)
                {
                    final = inner;
                    finalKey = key?.Member;
                }
            }
            expression = inner.Expression;
        }
        if (final is null)
            return;

        context.ReportDiagnostic(Diagnostic.Create(Rule, final.Name.GetLocation(),
            $"{final.Name.Identifier.Text}({finalKey ?? "…"})"));
    }

    // The selector's member name and receiver when the key is a plain `x => x.Member` off the lambda's
    // own parameter; null for computed keys (x.Name.Length), which are never unique.
    private static (string Member, IdentifierNameSyntax Root)? KeyOf(InvocationExpressionSyntax ordering)
    {
        var (parameter, body) = ordering.ArgumentList.Arguments.FirstOrDefault()?.Expression switch
        {
            SimpleLambdaExpressionSyntax simple => (simple.Parameter.Identifier.Text, simple.Body as ExpressionSyntax),
            ParenthesizedLambdaExpressionSyntax { ParameterList.Parameters: { Count: > 0 } parameters } lambda =>
                (parameters[0].Identifier.Text, lambda.Body as ExpressionSyntax),
            _ => (null, null),
        };
        return parameter is not null
            && body is MemberAccessExpressionSyntax { Name.Identifier.Text: var name, Expression: IdentifierNameSyntax root }
            && root.Identifier.Text == parameter
                ? (name, root)
                : null;
    }

    // Unique means the entity's own primary key: `Id`, or the EF-conventional `{Entity}Id` named after
    // the queried entity's type. Any other `*Id` is a foreign key — many rows share it.
    private static bool IsUnique((string Member, IdentifierNameSyntax Root)? key, SemanticModel model)
    {
        if (key is not { } k)
            return false;
        if (k.Member == "Id")
            return true;
        return model.GetTypeInfo(k.Root).Type is { Name: var entity }
            && k.Member == entity + "Id";
    }

    private static bool InsideSlice(SyntaxNode node) =>
        node.Ancestors().OfType<TypeDeclarationSyntax>().Any(type =>
            type.AttributeLists.SelectMany(list => list.Attributes)
                .Any(attribute => NameOf(attribute) is "Slice" or "SliceAttribute"));

    private static string NameOf(AttributeSyntax attribute) => attribute.Name switch
    {
        QualifiedNameSyntax qualified => qualified.Right.Identifier.Text,
        SimpleNameSyntax simple => simple.Identifier.Text,
        _ => "",
    };
}
