using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0021 — a domain type that is <em>persisted</em> or <em>owned by an entity</em> must carry its mark, so it
/// cannot escape the encapsulation checks the marks gate. SKY0013 (<c>[ValueObject]</c>) and SKY0014
/// (<c>[Entity]</c>) only fire on a type that is <b>already</b> marked; a type that is simply never marked is
/// invisible to them. That hole lets an anemic, public-setter "entity" — or a complex type used as entity state
/// that should be an always-valid value object — ship past the doctor untouched. This rule closes the hole from
/// the other side, by the two structural facts that make the omission detectable without guessing:
/// <list type="number">
/// <item><description>A type that appears as a <c>DbSet&lt;T&gt;</c> on a <c>DbContext</c> is a persisted
///   aggregate root — a table — i.e. an entity by definition. If <c>T</c> is not <c>[Entity]</c>, it escapes
///   SKY0014.</description></item>
/// <item><description>A property on an <c>[Entity]</c> whose type is a project-defined class/record that is
///   neither <c>[Entity]</c>, <c>[ValueObject]</c>, nor an <c>enum</c> is entity state with no mark. In this
///   architecture entity state is value objects + primitives + enums + ids (a cross-module reference is an id,
///   never an EF navigation), so a bare complex member is a value object that forgot <c>[ValueObject]</c> and
///   escapes SKY0013.</description></item>
/// </list>
/// Both signals are exact in this convention, so the rule is an error, not a heuristic. It deliberately does
/// <b>not</b> flag a type that is merely <em>declared</em> and unused — dead scaffolding is a different problem
/// (delete it), not an unmarked domain type. It only fires on a type that is actually persisted or actually held
/// as entity state. Types it does not own (no source location — a primitive, <c>Guid</c>, a framework type) are
/// never required to be marked.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class UnmarkedDomainTypeAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for a persisted or entity-owned type that does not declare its mark.</summary>
    public const string DiagnosticId = "SKY0021";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Persisted or entity-owned type must declare [Entity] or [ValueObject]",
        messageFormat: "{0}",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "A type persisted as a DbSet must be [Entity]; a complex type held as [Entity] state must "
                   + "be [ValueObject]. The marks gate SKY0013/SKY0014, which only fire on already-marked types — "
                   + "so an unmarked domain type would otherwise escape every encapsulation check.");

    private static readonly string[] CollectionNames =
    {
        "List", "IList", "IReadOnlyList", "ICollection", "IReadOnlyCollection",
        "IEnumerable", "HashSet", "ISet", "Collection",
    };

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSymbolAction(AnalyzeNamedType, SymbolKind.NamedType);
    }

    private static void AnalyzeNamedType(SymbolAnalysisContext context)
    {
        var type = (INamedTypeSymbol)context.Symbol;

        if (IsDbContext(type))
            AnalyzePersistedSets(context, type);

        if (HasMark(type, "Entity"))
            AnalyzeEntityState(context, type);
    }

    // Detector A — every DbSet<T> on a DbContext is a table; T must be [Entity].
    private static void AnalyzePersistedSets(SymbolAnalysisContext context, INamedTypeSymbol dbContext)
    {
        foreach (var prop in dbContext.GetMembers().OfType<IPropertySymbol>())
        {
            if (prop.Type is not INamedTypeSymbol { Name: "DbSet", TypeArguments.Length: 1 } set)
                continue;

            if (set.TypeArguments[0] is not INamedTypeSymbol entity)
                continue;

            if (!OwnedInSource(entity) || HasMark(entity, "Entity") || HasMark(entity, "Keyless"))
                continue;

            Report(context, entity,
                $"'{entity.Name}' is persisted as a DbSet (a table) but is not marked [Entity] — an unmarked "
                + "persisted type escapes SKY0014's encapsulation + invariant-funnel checks. Mark it [Entity] "
                + "(private setters, a static factory, an EnsureValid funnel), or remove it from the DbContext.");
        }
    }

    // Detector B — a complex member of an [Entity] that isn't a VO/entity/enum is an unmarked value object.
    private static void AnalyzeEntityState(SymbolAnalysisContext context, INamedTypeSymbol entity)
    {
        foreach (var prop in entity.GetMembers().OfType<IPropertySymbol>())
        {
            if (prop.IsStatic || prop.IsIndexer || prop.GetMethod is null)
                continue;
            if (HasMark(prop, "NotMapped"))
                continue;

            var memberType = Unwrap(prop.Type);
            if (memberType is not INamedTypeSymbol named)
                continue;

            if (!OwnedInSource(named))
                continue;                                   // primitives, Guid, string, framework types
            if (named.TypeKind == TypeKind.Enum)
                continue;                                   // enums are legitimate entity state
            if (HasMark(named, "ValueObject") || HasMark(named, "Entity"))
                continue;                                   // a VO, or a navigation handled by SKY0009

            Report(context, prop,
                $"property '{prop.Name}' on entity '{entity.Name}' is typed '{named.Name}', a domain type that "
                + "is neither [Entity], [ValueObject], nor an enum — entity state must be a value object (or a "
                + $"primitive / enum / id). An unmarked complex member escapes SKY0013. Mark '{named.Name}' "
                + "[ValueObject] (build it through a static From returning Result), or reference the other entity "
                + "by its id.");
        }
    }

    // Strip a single Nullable<T> and a single collection layer, so `Address?` and `IReadOnlyList<Address>`
    // both resolve to the element the rule cares about.
    private static ITypeSymbol Unwrap(ITypeSymbol type)
    {
        if (type is INamedTypeSymbol { OriginalDefinition.SpecialType: SpecialType.System_Nullable_T } nullable)
            return nullable.TypeArguments[0];

        if (type is INamedTypeSymbol { TypeArguments.Length: 1 } generic && CollectionNames.Contains(generic.Name))
            return generic.TypeArguments[0];

        return type;
    }

    // A type this project authors — it has a declaration in source. Excludes primitives, Guid, framework types.
    private static bool OwnedInSource(INamedTypeSymbol type) =>
        type.Locations.Any(l => l.IsInSource) && type.SpecialType == SpecialType.None;

    private static bool IsDbContext(INamedTypeSymbol type)
    {
        for (var b = type.BaseType; b is not null; b = b.BaseType)
            if (b.Name == "DbContext")
                return true;
        return false;
    }

    // Matches the attribute by simple name (with or without the Attribute suffix), so a project need not
    // reference Skies.Framework.Abstractions for the doctor to read the mark — the same posture as SKY0013/SKY0014.
    private static bool HasMark(ISymbol symbol, string mark) =>
        symbol.GetAttributes().Any(a => a.AttributeClass is { } c
            && (c.Name == mark || c.Name == mark + "Attribute"));

    private static void Report(SymbolAnalysisContext context, ISymbol target, string message)
    {
        var location = target.Locations.FirstOrDefault(l => l.IsInSource);
        if (location is not null)
            context.ReportDiagnostic(Diagnostic.Create(Rule, location, message));
    }
}
