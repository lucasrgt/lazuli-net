using System.Linq;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Skies.Framework.Doctor;

/// <summary>
/// The shared "what module does this slice belong to?" reading — the convention that a slice's module is the
/// last segment of its enclosing namespace (<c>App.Api.Modules.Wallets</c> → <c>Wallets</c>; the
/// <c>Slices/</c> subfolder is not part of the namespace). Hoisted so every rule that keys off the module —
/// <c>SKY0004</c>'s ctx lookup, and the spec-manifest rules <c>SKY0030</c>/<c>SKY0031</c> — names the module the
/// one way and they can never disagree.
/// </summary>
internal static class ModuleNaming
{
    /// <summary>
    /// The module a slice class belongs to: the last segment of its enclosing namespace, or <see langword="null"/>
    /// when the class sits in no namespace (the module convention does not apply).
    /// </summary>
    public static string? ModuleOf(ClassDeclarationSyntax cls)
    {
        var name = cls.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().FirstOrDefault()?.Name.ToString();
        if (string.IsNullOrEmpty(name))
            return null;
        var dot = name!.LastIndexOf('.');
        return dot >= 0 ? name.Substring(dot + 1) : name;
    }
}
