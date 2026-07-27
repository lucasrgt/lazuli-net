using Assay.Net;

namespace Skies.Framework.Cli;

/// <summary>An executable archetype the referenced Assay.Net adapter ships, discovered by reflection.</summary>
/// <param name="Name">The catalog archetype id (e.g. <c>request-idempotency</c>).</param>
/// <param name="ArchetypeType">The archetype class (e.g. <c>RequestIdempotency</c>).</param>
/// <param name="SubjectType">The subject record the archetype drives (e.g. <c>RequestIdempotencySubject</c>).</param>
/// <param name="OracleIds">The criterion ids the archetype binds a mechanical .NET oracle for.</param>
internal sealed record ArchetypeBinding(string Name, Type ArchetypeType, Type SubjectType, IReadOnlyList<string> OracleIds);

/// <summary>
/// Discovers the executable surface of the referenced Assay.Net package by reflection — every concrete
/// <c>Archetype&lt;TSubject&gt;</c>, its subject type and the criterion ids it can actually run. Nothing is
/// hardcoded, so a new archetype (or a renamed subject) in a future Assay.Net flows into <c>skies criteria</c>
/// and the proof scaffolder automatically instead of drifting a static map.
/// </summary>
internal static class AvpBinding
{
    private static readonly Lazy<IReadOnlyList<ArchetypeBinding>> Cache = new(Discover);

    /// <summary>Every executable archetype in the referenced Assay.Net, ordered by catalog name.</summary>
    public static IReadOnlyList<ArchetypeBinding> All => Cache.Value;

    /// <summary>The archetypes whose oracles can run <paramref name="criterionId"/> (usually one; variants share an id).</summary>
    public static IReadOnlyList<ArchetypeBinding> For(string criterionId) =>
        All.Where(b => b.OracleIds.Contains(criterionId, StringComparer.Ordinal)).ToList();

    private static IReadOnlyList<ArchetypeBinding> Discover()
    {
        var bindings = new List<ArchetypeBinding>();
        foreach (var type in typeof(Catalog).Assembly.GetTypes())
        {
            if (type.IsAbstract
                || type.BaseType is not { IsGenericType: true } baseType
                || baseType.GetGenericTypeDefinition() != typeof(Archetype<>)
                || type.GetConstructor(Type.EmptyTypes) is null)
                continue;

            var instance = Activator.CreateInstance(type)!;
            var name = (string?)type.GetProperty("Name")?.GetValue(instance);
            var oracles = type.GetProperty("Oracles")?.GetValue(instance);
            if (name is null || oracles is null)
                continue;

            var keys = oracles.GetType().GetProperty("Keys")?.GetValue(oracles) as System.Collections.IEnumerable;
            var ids = (keys?.Cast<string>() ?? []).OrderBy(id => id, StringComparer.Ordinal).ToList();
            bindings.Add(new ArchetypeBinding(name, type, baseType.GetGenericArguments()[0], ids));
        }

        return bindings.OrderBy(b => b.Name, StringComparer.Ordinal).ThenBy(b => b.ArchetypeType.Name, StringComparer.Ordinal).ToList();
    }
}
