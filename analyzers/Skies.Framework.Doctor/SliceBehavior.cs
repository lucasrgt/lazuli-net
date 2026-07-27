using System.Linq;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Skies.Framework.Doctor;

/// <summary>Derives a slice's verification shape from ordinary C# instead of a self-declared risk label.</summary>
internal static class SliceBehavior
{
    private static readonly string[] WriteEndpointMethods =
        ["MapPost", "MapPut", "MapPatch", "MapDelete", "MapMethods"];

    private static readonly string[] PersistenceWriteMethods =
    [
        "SaveChanges", "SaveChangesAsync",
        "ExecuteUpdate", "ExecuteUpdateAsync",
        "ExecuteDelete", "ExecuteDeleteAsync",
        "ExecuteSqlRaw", "ExecuteSqlRawAsync",
        "ExecuteSqlInterpolated", "ExecuteSqlInterpolatedAsync",
    ];

    /// <summary>
    /// Whether the slice can change state. A slice is read-only only when it visibly maps at least one GET,
    /// maps no mutating endpoint, and calls no persistence save. Missing or unconventional mapping is ambiguous
    /// and therefore receives write-depth verification.
    /// </summary>
    public static bool IsWrite(ClassDeclarationSyntax cls)
    {
        var calledMembers = cls.DescendantNodes()
            .OfType<MemberAccessExpressionSyntax>()
            .Select(access => access.Name.Identifier.Text)
            .ToList();

        if (calledMembers.Any(name => PersistenceWriteMethods.Contains(name)))
            return true;
        if (calledMembers.Any(name => WriteEndpointMethods.Contains(name)))
            return true;

        return !calledMembers.Contains("MapGet");
    }
}
