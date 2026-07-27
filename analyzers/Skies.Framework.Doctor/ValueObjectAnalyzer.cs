using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0013 — a type marked <c>[ValueObject]</c> must be <em>always-valid by construction</em>: immutable,
/// with no public constructor and no public setter, built only through a static smart constructor that
/// returns a <c>Result&lt;T&gt;</c> (the <c>Money.From</c> shape). The payoff is that an invalid instance can
/// never exist, so there is no "validate afterwards" step a caller can forget — the type itself is the rule.
///
/// The rule matches the <c>[ValueObject]</c> attribute by simple name, so a project does not need to
/// reference Skies.Framework.Abstractions for the doctor to enforce the shape.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class ValueObjectAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for a value object that is not always-valid by construction.</summary>
    public const string DiagnosticId = "SKY0013";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Value object must be always-valid by construction",
        messageFormat: "Value object '{0}' {1}",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "A [ValueObject] is immutable and built only through a static smart constructor "
                   + "returning Result<T> — no public constructor, no public setter — so an invalid "
                   + "instance can never exist (the Money.From shape).");

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(Analyze,
            SyntaxKind.ClassDeclaration, SyntaxKind.StructDeclaration,
            SyntaxKind.RecordDeclaration, SyntaxKind.RecordStructDeclaration);
    }

    private static void Analyze(SyntaxNodeAnalysisContext context)
    {
        var type = (TypeDeclarationSyntax)context.Node;
        if (!IsValueObject(type))
            return;

        var name = type.Identifier.Text;
        var at = type.Identifier.GetLocation();

        // A primary/positional constructor (record positional params or a C# 12 primary ctor) is a public
        // way in that skips the smart constructor — so it defeats the always-valid guarantee.
        if (type.ParameterList is not null)
            Report(context, at, name, "must not expose a primary/positional constructor — build it through a "
                                    + "static smart constructor returning Result<" + name + "> (e.g. From)");

        foreach (var ctor in type.Members.OfType<ConstructorDeclarationSyntax>().Where(c => IsAccessible(c.Modifiers)))
            Report(context, ctor.Identifier.GetLocation(), name,
                "must not expose a public constructor — build it through a static smart constructor "
                + "returning Result<" + name + "> (e.g. From)");

        if (!HasSmartConstructor(type, name))
            Report(context, at, name, "must declare a public static smart constructor returning Result<" + name
                                    + "> (e.g. From) — the only way to build a valid instance");

        foreach (var prop in type.Members.OfType<PropertyDeclarationSyntax>().Where(HasPublicSetter))
            Report(context, prop.Identifier.GetLocation(), name,
                "must be immutable — property '" + prop.Identifier.Text + "' has a public setter; use "
                + "'{ get; }' or '{ get; init; }'");
    }

    // A public/internal static method whose return type is Result<Name> — the smart constructor.
    private static bool HasSmartConstructor(TypeDeclarationSyntax type, string name) =>
        type.Members.OfType<MethodDeclarationSyntax>()
            .Any(m => m.Modifiers.Any(SyntaxKind.StaticKeyword)
                   && IsAccessible(m.Modifiers)
                   && m.ReturnType.ToString().Replace(" ", "").Contains("Result<" + name + ">"));

    private static bool HasPublicSetter(PropertyDeclarationSyntax prop)
    {
        if (!IsAccessible(prop.Modifiers))
            return false;
        var setter = prop.AccessorList?.Accessors.FirstOrDefault(a => a.IsKind(SyntaxKind.SetAccessorDeclaration));
        return setter is not null && !RestrictsAccess(setter.Modifiers);
    }

    private static bool IsAccessible(SyntaxTokenList modifiers) =>
        modifiers.Any(SyntaxKind.PublicKeyword) || modifiers.Any(SyntaxKind.InternalKeyword)
        || modifiers.Any(SyntaxKind.ProtectedKeyword);

    private static bool RestrictsAccess(SyntaxTokenList modifiers) =>
        modifiers.Any(SyntaxKind.PrivateKeyword) || modifiers.Any(SyntaxKind.ProtectedKeyword)
        || modifiers.Any(SyntaxKind.InternalKeyword);

    private static bool IsValueObject(TypeDeclarationSyntax type) =>
        type.AttributeLists.SelectMany(list => list.Attributes).Select(attr => attr.Name.ToString())
            .Any(n => n is "ValueObject" or "ValueObjectAttribute"
                   || n.EndsWith(".ValueObject") || n.EndsWith(".ValueObjectAttribute"));

    private static void Report(SyntaxNodeAnalysisContext context, Location location, string name, string problem) =>
        context.ReportDiagnostic(Diagnostic.Create(Rule, location, name, problem));
}
