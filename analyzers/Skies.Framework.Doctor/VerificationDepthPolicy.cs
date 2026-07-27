using System.Linq;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Skies.Framework.Doctor;

/// <summary>
/// The fail-closed verification-depth policy. Test depth is derived from the slice's observable shape;
/// application code does not classify its own proof obligation. A read is the narrow, mechanically
/// recognizable case: it maps only GET endpoints and saves no state. Every other slice is treated as a write,
/// including an ambiguous shape, so uncertainty can only increase proof depth.
/// </summary>
internal static class VerificationDepthPolicy
{
    /// <summary>Whether a class is a slice.</summary>
    public static bool IsSlice(ClassDeclarationSyntax cls) => HasAttribute(cls, "Slice");

    /// <summary>Whether a slice must carry happy and sad backend journeys.</summary>
    public static bool RequiresJourneys(ClassDeclarationSyntax cls) =>
        IsSlice(cls) && SliceBehavior.IsWrite(cls);

    /// <summary>Textual attribute match shared by the depth analyzers.</summary>
    public static bool HasAttribute(ClassDeclarationSyntax cls, string name) =>
        cls.AttributeLists
            .SelectMany(list => list.Attributes)
            .Select(attribute => attribute.Name.ToString())
            .Any(candidate => candidate == name || candidate == name + "Attribute"
                || candidate.EndsWith("." + name) || candidate.EndsWith("." + name + "Attribute"));
}
