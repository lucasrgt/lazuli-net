using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0023 — <b>an injected <c>ICurrentUser</c> must be consulted</b>. A <c>[Slice]</c>'s <c>Handle</c> that takes
/// an <c>ICurrentUser</c> parameter and never reads it is almost certainly missing its authorization check: the
/// caller was wired in (someone meant to scope the operation to them) and then the scoping never happened — the
/// slice operates on whatever id the request carries. Either consult the caller (ownership / role / org check,
/// or use their id instead of a client-sent one) or remove the parameter so the signature stops claiming a
/// check that does not exist.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class CurrentUserUnusedAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported when a slice injects the caller and never consults them.</summary>
    public const string DiagnosticId = "SKY0023";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Injected ICurrentUser must be consulted",
        messageFormat: "Slice '{0}' injects ICurrentUser '{1}' into Handle but never reads it — consult the "
                     + "caller (ownership/role/org check) or remove the parameter; an unread caller usually "
                     + "means a missing authorization check",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "A [Slice] Handle that takes ICurrentUser and never reads it claims an authorization "
                   + "posture it does not have — the injected caller exists to scope the operation, so an "
                   + "unread parameter is a missing check, not dead code.");

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

        foreach (var handle in cls.Members.OfType<MethodDeclarationSyntax>()
                     .Where(m => m.Identifier.Text == "Handle"))
            foreach (var parameter in handle.ParameterList.Parameters)
                if (IsCurrentUser(parameter.Type) && !IsRead(handle, parameter.Identifier.Text))
                    context.ReportDiagnostic(Diagnostic.Create(
                        Rule, parameter.GetLocation(), cls.Identifier.Text, parameter.Identifier.Text));
    }

    // The seam is matched by simple type name, so a project needs no reference to Skies.Framework.Auth for the rule
    // to hold — the same posture as the attribute matching across the doctor.
    private static bool IsCurrentUser(TypeSyntax? type) =>
        type is not null
        && type.ToString() is var name
        && (name == "ICurrentUser" || name.EndsWith(".ICurrentUser"));

    private static bool IsRead(MethodDeclarationSyntax handle, string parameterName)
    {
        var body = (SyntaxNode?)handle.Body ?? handle.ExpressionBody;
        return body is not null
            && body.DescendantNodes()
                .OfType<IdentifierNameSyntax>()
                .Any(id => id.Identifier.Text == parameterName);
    }

    private static bool IsSlice(ClassDeclarationSyntax cls) =>
        cls.AttributeLists
            .SelectMany(list => list.Attributes)
            .Select(attr => attr.Name.ToString())
            .Any(n => n is "Slice" or "SliceAttribute"
                   || n.EndsWith(".Slice")
                   || n.EndsWith(".SliceAttribute"));
}
