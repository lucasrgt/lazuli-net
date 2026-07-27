using System.Text.RegularExpressions;
using System.Xml.Linq;
using Assay.Net;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Skies.Framework.Cli;

/// <summary>An AVP proof site: which subject and test method proves a criterion.</summary>
/// <param name="Module">The module namespace containing the proof.</param>
/// <param name="Subject">The production subject named by <c>typeof(...)</c>.</param>
/// <param name="CriterionId">The catalog criterion id the proof carries.</param>
/// <param name="File">The proof file, relative to the workspace root.</param>
/// <param name="ClassName">The namespace-qualified declaring class, used to match the test-run verdict.</param>
/// <param name="Method">The proof method name, used to match the test-run verdict.</param>
internal sealed record AvpProof(
    string Module, string Subject, string CriterionId, string File, string ClassName, string Method);

/// <summary>A <c>[Slice]</c> class found in source: the code-side inventory the manifest is checked against.</summary>
/// <param name="Module">The module the slice belongs to (namespace-derived, path fallback).</param>
/// <param name="Name">The slice class name.</param>
/// <param name="File">The slice file, relative to the workspace root.</param>
internal sealed record SliceSite(string Module, string Name, string File);

/// <summary>A slice-bound backend journey, used to include its test class in an affected proof run.</summary>
/// <param name="Subject">The slice named by <c>typeof(...)</c>.</param>
/// <param name="File">The journey file, relative to the workspace root.</param>
/// <param name="ClassName">The namespace-qualified declaring class.</param>
/// <param name="Method">The journey method carrying the binding.</param>
internal sealed record JourneyProof(string Subject, string File, string ClassName, string Method);

/// <summary>A discoverable C# test class and its source file.</summary>
/// <param name="File">The test file, relative to the workspace root.</param>
/// <param name="ClassName">The namespace-qualified declaring class.</param>
internal sealed record CSharpTestSite(string File, string ClassName);

/// <summary>One test method's outcome from a TRX result file, keyed the way proofs are matched.</summary>
/// <param name="ClassName">The fully-qualified test class from the TRX definition.</param>
/// <param name="Method">The test method name.</param>
/// <param name="Outcome">The raw TRX outcome (<c>Passed</c>, <c>Failed</c>, <c>NotExecuted</c>, …).</param>
internal sealed record TestVerdict(string ClassName, string Method, string Outcome);

/// <summary>A discovered <c>&lt;Module&gt;.spec.toml</c>: parsed when well-formed, an error otherwise.</summary>
/// <param name="Path">The manifest path, relative to the workspace root.</param>
/// <param name="Manifest">The parsed manifest, or <c>null</c> when it could not be read.</param>
/// <param name="Error">The reason the manifest could not be read, when <paramref name="Manifest"/> is null.</param>
internal sealed record ManifestFile(string Path, SpecManifest? Manifest, string? Error);

/// <summary>
/// The gate's evidence collectors: the <c>*.spec.toml</c> declarations, the <c>[AVP]</c> proof sites, the
/// <c>[Slice]</c> inventory and the test-run verdicts. C# sites are read from Roslyn syntax so examples inside
/// strings, analyzer fixtures, templates and comments cannot impersonate executable evidence. The scans only
/// report; enforcement stays with the doctor's symbol-aware rules.
/// </summary>
internal static class GateScan
{
    private static readonly string[] SkippedDirs =
        ["bin", "obj", "node_modules", ".git", "dist", "coverage", "vendor", "local-feed", "templates"];

    private static readonly Regex ModuleNamespacePattern =
        new(@"namespace\s+[\w.]+\.Modules\.(?<module>\w+)", RegexOptions.Compiled);

    /// <summary>Find and parse every <c>*.spec.toml</c> under <paramref name="root"/>; a malformed one is reported, never thrown.</summary>
    public static IReadOnlyList<ManifestFile> DiscoverManifests(string root)
    {
        var manifests = new List<ManifestFile>();
        foreach (var file in Walk(root, "*.spec.toml"))
        {
            try
            {
                manifests.Add(new ManifestFile(Relative(root, file), SpecManifest.Load(file), null));
            }
            catch (Exception e) when (e is FormatException or IOException)
            {
                manifests.Add(new ManifestFile(Relative(root, file), null, e.Message));
            }
        }

        return manifests;
    }

    /// <summary>Collect every AVP site in the workspace's C# sources, with its subject, class and method.</summary>
    public static IReadOnlyList<AvpProof> ScanProofs(string root)
    {
        var proofs = new List<AvpProof>();
        foreach (var file in Walk(root, "*.cs"))
        {
            var text = File.ReadAllText(file);
            if (!text.Contains("AVP", StringComparison.Ordinal))
                continue;

            var syntax = CSharpSyntaxTree.ParseText(text).GetRoot();
            foreach (var method in syntax.DescendantNodes().OfType<MethodDeclarationSyntax>())
            {
                foreach (var attribute in method.AttributeLists.SelectMany(list => list.Attributes)
                             .Where(attribute => IsAttribute(attribute, "AVP")))
                {
                    if (!TryReadAvp(attribute, out var subject, out var criterionId))
                        continue;
                    var declaringClass = method.Ancestors().OfType<ClassDeclarationSyntax>().FirstOrDefault();
                    if (declaringClass is null)
                        continue;
                    var fileNamespace = NamespaceOf(declaringClass);
                    proofs.Add(new AvpProof(
                        ModuleOf(fileNamespace, file), subject, criterionId, Relative(root, file),
                        Qualified(fileNamespace, ClassOf(method)), method.Identifier.ValueText));
                }
            }
        }

        return proofs;
    }

    /// <summary>Collect every class carrying <c>[Slice]</c>.</summary>
    public static IReadOnlyList<SliceSite> ScanSlices(string root)
    {
        var slices = new List<SliceSite>();
        foreach (var file in Walk(root, "*.cs"))
        {
            var text = File.ReadAllText(file);
            if (!text.Contains("Slice", StringComparison.Ordinal))
                continue;

            var syntax = CSharpSyntaxTree.ParseText(text).GetRoot();
            foreach (var declaration in syntax.DescendantNodes().OfType<ClassDeclarationSyntax>())
            {
                if (!HasAttribute(declaration, "Slice"))
                    continue;
                var fileNamespace = NamespaceOf(declaration);
                slices.Add(new SliceSite(
                    ModuleOf(fileNamespace, file),
                    declaration.Identifier.ValueText,
                    Relative(root, file)));
            }
        }

        return slices;
    }

    /// <summary>Collect every method carrying a canonical slice-bound <c>[Journey]</c> declaration.</summary>
    public static IReadOnlyList<JourneyProof> ScanJourneys(string root)
    {
        var journeys = new List<JourneyProof>();
        foreach (var file in Walk(root, "*.cs"))
        {
            var text = File.ReadAllText(file);
            if (!text.Contains("Journey", StringComparison.Ordinal))
                continue;

            var syntax = CSharpSyntaxTree.ParseText(text).GetRoot();
            foreach (var method in syntax.DescendantNodes().OfType<MethodDeclarationSyntax>())
            {
                foreach (var attribute in method.AttributeLists.SelectMany(list => list.Attributes)
                             .Where(attribute => IsAttribute(attribute, "Journey")))
                {
                    if (!TryReadSubject(attribute, out var subject))
                        continue;
                    var declaringClass = method.Ancestors().OfType<ClassDeclarationSyntax>().FirstOrDefault();
                    if (declaringClass is null)
                        continue;
                    var fileNamespace = NamespaceOf(declaringClass);
                    journeys.Add(new JourneyProof(
                        subject,
                        Relative(root, file),
                        Qualified(fileNamespace, ClassOf(method)),
                        method.Identifier.ValueText));
                }
            }
        }

        return journeys;
    }

    /// <summary>Collect classes that contain an executable xUnit, AVP, or Journey method.</summary>
    public static IReadOnlyList<CSharpTestSite> ScanTestClasses(string root)
    {
        var sites = new List<CSharpTestSite>();
        foreach (var file in Walk(root, "*.cs"))
        {
            var text = File.ReadAllText(file);
            if (!text.Contains("[Fact", StringComparison.Ordinal)
                && !text.Contains("[Theory", StringComparison.Ordinal)
                && !text.Contains("[AVP", StringComparison.Ordinal)
                && !text.Contains("[Journey", StringComparison.Ordinal))
            {
                continue;
            }

            var syntax = CSharpSyntaxTree.ParseText(text).GetRoot();
            foreach (var declaration in syntax.DescendantNodes().OfType<ClassDeclarationSyntax>())
            {
                var executable = declaration.Members.OfType<MethodDeclarationSyntax>()
                    .Any(method => method.AttributeLists.SelectMany(list => list.Attributes).Any(attribute =>
                        IsAttribute(attribute, "Fact") || IsAttribute(attribute, "Theory")
                        || IsAttribute(attribute, "AVP") || IsAttribute(attribute, "Journey")));
                if (!executable)
                    continue;
                var fileNamespace = NamespaceOf(declaration);
                sites.Add(new CSharpTestSite(
                    Relative(root, file),
                    Qualified(fileNamespace, string.Join("+", declaration.AncestorsAndSelf()
                        .OfType<ClassDeclarationSyntax>().Reverse().Select(type => type.Identifier.ValueText)))));
            }
        }

        return sites;
    }

    /// <summary>Parse every <c>*.trx</c> in <paramref name="resultsDirectory"/> into per-method outcomes.</summary>
    public static IReadOnlyList<TestVerdict> ParseTrxDirectory(string resultsDirectory)
    {
        var verdicts = new List<TestVerdict>();
        if (!Directory.Exists(resultsDirectory))
            return verdicts;

        foreach (var trx in Directory.EnumerateFiles(resultsDirectory, "*.trx", SearchOption.AllDirectories))
        {
            XDocument doc;
            try
            {
                doc = XDocument.Load(trx);
            }
            catch (System.Xml.XmlException)
            {
                continue;   // a truncated result file cannot contribute verdicts; the test exit code still gates
            }

            XNamespace ns = "http://microsoft.com/schemas/VisualStudio/TeamTest/2010";
            var definitions = doc.Descendants(ns + "UnitTest")
                .Select(t => (Id: (string?)t.Attribute("id"), Method: t.Element(ns + "TestMethod")))
                .Where(t => t.Id is not null && t.Method is not null)
                .ToDictionary(
                    t => t.Id!,
                    t => (Class: ClassOnly((string?)t.Method!.Attribute("className") ?? ""),
                          Name: (string?)t.Method!.Attribute("name") ?? ""));

            foreach (var result in doc.Descendants(ns + "UnitTestResult"))
            {
                var id = (string?)result.Attribute("testId");
                if (id is null || !definitions.TryGetValue(id, out var test))
                    continue;
                verdicts.Add(new TestVerdict(test.Class, test.Name, (string?)result.Attribute("outcome") ?? "NotExecuted"));
            }
        }

        return verdicts;
    }

    // The TRX className may carry an ", Assembly" suffix; the type name is what proofs are matched on.
    private static string ClassOnly(string className)
    {
        var comma = className.IndexOf(',');
        return comma < 0 ? className : className[..comma];
    }

    private static string Qualified(string fileNamespace, string className) =>
        fileNamespace.Length == 0 ? className : fileNamespace + "." + className;

    private static bool TryReadAvp(AttributeSyntax attribute, out string subject, out string criterionId)
    {
        subject = "";
        criterionId = "";
        var arguments = attribute.ArgumentList?.Arguments;
        if (arguments is null || arguments.Value.Count != 2
            || arguments.Value[0].Expression is not TypeOfExpressionSyntax typeOf)
            return false;

        subject = SimpleTypeName(typeOf.Type.ToString());
        if (arguments.Value[1].Expression is not LiteralExpressionSyntax literal
            || !literal.IsKind(SyntaxKind.StringLiteralExpression))
            return false;
        criterionId = literal.Token.ValueText;
        return criterionId.Length > 0;
    }

    private static bool TryReadSubject(AttributeSyntax attribute, out string subject)
    {
        subject = "";
        var arguments = attribute.ArgumentList?.Arguments;
        if (arguments is null || arguments.Value.Count == 0
            || arguments.Value[0].Expression is not TypeOfExpressionSyntax typeOf)
        {
            return false;
        }

        subject = SimpleTypeName(typeOf.Type.ToString());
        return subject.Length > 0;
    }

    private static string SimpleTypeName(string type) =>
        type.Replace("global::", "", StringComparison.Ordinal).Split('.').Last().Split('<')[0];

    private static bool HasAttribute(ClassDeclarationSyntax declaration, string expected) =>
        declaration.AttributeLists.SelectMany(list => list.Attributes).Any(attribute => IsAttribute(attribute, expected));

    private static bool IsAttribute(AttributeSyntax attribute, string expected)
    {
        var name = attribute.Name.ToString().Replace("global::", "", StringComparison.Ordinal).Split('.').Last();
        return name == expected || name == expected + "Attribute";
    }

    private static string NamespaceOf(SyntaxNode declaration) =>
        declaration.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().FirstOrDefault()?.Name.ToString() ?? "";

    private static string ClassOf(MethodDeclarationSyntax method) =>
        string.Join("+", method.Ancestors().OfType<ClassDeclarationSyntax>().Reverse()
            .Select(declaration => declaration.Identifier.ValueText));

    // A slice's module: the `namespace <App>.Modules.<M>` line when present, else the Modules/<M>/ path segment.
    private static string ModuleOf(string fileNamespace, string file)
    {
        var ns = ModuleNamespacePattern.Match("namespace " + fileNamespace);
        if (ns.Success)
            return ns.Groups["module"].Value;

        var segments = file.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var modules = Array.IndexOf(segments, "Modules");
        return modules >= 0 && modules + 1 < segments.Length ? segments[modules + 1] : "";
    }

    // Depth-first file walk that skips build/dependency dirs — enumerating into node_modules would dominate the scan.
    internal static IEnumerable<string> Walk(string root, string pattern)
    {
        var stack = new Stack<string>();
        stack.Push(root);
        while (stack.Count > 0)
        {
            var dir = stack.Pop();
            foreach (var sub in Directory.EnumerateDirectories(dir))
                if (!SkippedDirs.Contains(Path.GetFileName(sub), StringComparer.OrdinalIgnoreCase))
                    stack.Push(sub);
            foreach (var file in Directory.EnumerateFiles(dir, pattern))
                yield return file;
        }
    }

    // Forward slashes keep the committed artifacts identical across OSes (the matrix travels with the repo).
    private static string Relative(string root, string path) =>
        Path.GetRelativePath(root, path).Replace('\\', '/');
}
