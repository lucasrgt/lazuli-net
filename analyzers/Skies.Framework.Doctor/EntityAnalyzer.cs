using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0014 — a class marked <c>[Entity]</c> must encapsulate its state and guard its invariants. It exposes
/// no public constructor (it is born through a static factory like <c>Open</c> and rehydrated by EF through a
/// private parameterless one), no public property setter (state changes through intention-revealing methods),
/// and a single private invariant funnel — <c>EnsureValid()</c> (or <c>Validate()</c>) returning a
/// <c>Result&lt;T&gt;</c> — that every create and mutate path returns through, so the entity can never be
/// observed or persisted in a broken state. The required private parameterless constructor is exactly the one
/// EF Core uses to materialise a row, so the convention and the ORM ask for the same thing.
///
/// The rule matches the <c>[Entity]</c> attribute by simple name, so a project does not need to reference
/// Skies.Framework.Abstractions for the doctor to enforce the shape.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class EntityAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for an entity that does not encapsulate its state or its invariants.</summary>
    public const string DiagnosticId = "SKY0014";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Entity must encapsulate its state and guard its invariants",
        messageFormat: "Entity '{0}' {1}",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "An [Entity] exposes no public constructor (born through a factory, rehydrated by EF "
                   + "through a private one) and no public setter, and declares a private EnsureValid() "
                   + "invariant funnel returning Result<T> that every create and mutate path returns through.");

    private static readonly string[] FunnelNames = { "EnsureValid", "Validate" };

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
        if (!IsEntity(cls))
            return;

        var name = cls.Identifier.Text;
        var at = cls.Identifier.GetLocation();

        if (cls.ParameterList is not null)
            Report(context, at, name, "must not expose a primary constructor — open it through a static factory "
                                    + "(e.g. Open) and keep a private parameterless constructor for EF");

        var constructors = cls.Members.OfType<ConstructorDeclarationSyntax>().ToList();
        foreach (var ctor in constructors.Where(c => IsAccessible(c.Modifiers)))
            Report(context, ctor.Identifier.GetLocation(), name,
                "must not expose a public constructor — open it through a static factory (e.g. Open)");

        // With no declared constructor the compiler emits a public parameterless one — a public way in. The
        // entity must declare a private one (the same one EF materialises through).
        if (constructors.Count == 0)
            Report(context, at, name, "must declare a private parameterless constructor for EF materialisation "
                                    + "(and a static factory to open it), so there is no public way to construct it");

        foreach (var prop in cls.Members.OfType<PropertyDeclarationSyntax>().Where(HasPublicSetter))
            Report(context, prop.Identifier.GetLocation(), name,
                "must encapsulate its state — property '" + prop.Identifier.Text + "' has a public setter; "
                + "change it through a method and declare it '{ get; private set; }'");

        if (!HasInvariantFunnel(cls))
            Report(context, at, name, "must declare a private invariant funnel 'EnsureValid()' returning Result<"
                                    + name + "> that every create and mutate path returns through");
    }

    // A private method named EnsureValid/Validate returning Result<...> — the single invariant checkpoint.
    private static bool HasInvariantFunnel(ClassDeclarationSyntax cls) =>
        cls.Members.OfType<MethodDeclarationSyntax>()
            .Any(m => FunnelNames.Contains(m.Identifier.Text)
                   && !IsAccessible(m.Modifiers)
                   && m.ReturnType.ToString().Replace(" ", "").Contains("Result<"));

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

    private static bool IsEntity(ClassDeclarationSyntax cls) =>
        cls.AttributeLists.SelectMany(list => list.Attributes).Select(attr => attr.Name.ToString())
            .Any(n => n is "Entity" or "EntityAttribute"
                   || n.EndsWith(".Entity") || n.EndsWith(".EntityAttribute"));

    private static void Report(SyntaxNodeAnalysisContext context, Location location, string name, string problem) =>
        context.ReportDiagnostic(Diagnostic.Create(Rule, location, name, problem));
}
