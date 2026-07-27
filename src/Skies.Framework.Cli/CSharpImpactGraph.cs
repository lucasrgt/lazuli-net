using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Skies.Framework.Cli;

/// <summary>
/// A syntax-derived reverse dependency graph for C# source files. It deliberately uses names rather than a
/// compilation: consumer repositories may contain several projects and generated prerequisites, while an
/// over-selection is safe and an omitted consumer is not. Ambiguous names therefore add every possible edge.
/// </summary>
internal sealed class CSharpImpactGraph
{
    private readonly IReadOnlyDictionary<string, HashSet<string>> _consumers;
    private readonly IReadOnlySet<string> _files;

    private CSharpImpactGraph(
        IReadOnlyDictionary<string, HashSet<string>> consumers,
        IReadOnlySet<string> files)
    {
        _consumers = consumers;
        _files = files;
    }

    /// <summary>Build the workspace graph from executable C# sources, excluding build and dependency trees.</summary>
    public static CSharpImpactGraph Build(string root)
    {
        var documents = GateScan.Walk(root, "*.cs")
            .Select(file => Read(root, file))
            .Where(document => document is not null)
            .Cast<SourceDocument>()
            .ToList();
        var declarations = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        foreach (var document in documents)
        {
            foreach (var declaration in document.Declarations)
            {
                if (!declarations.TryGetValue(declaration, out var files))
                {
                    files = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    declarations[declaration] = files;
                }

                files.Add(document.Path);
            }
        }

        var consumers = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var document in documents)
        {
            foreach (var reference in document.References)
            {
                if (!declarations.TryGetValue(reference, out var declaredBy))
                    continue;
                foreach (var dependency in declaredBy.Where(path => !SamePath(path, document.Path)))
                {
                    if (!consumers.TryGetValue(dependency, out var referencingFiles))
                    {
                        referencingFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        consumers[dependency] = referencingFiles;
                    }

                    referencingFiles.Add(document.Path);
                }
            }
        }

        return new CSharpImpactGraph(
            consumers,
            documents.Select(document => document.Path).ToHashSet(StringComparer.OrdinalIgnoreCase));
    }

    /// <summary>Return the changed file and every source file that depends on it, directly or transitively.</summary>
    public IReadOnlySet<string> Expand(string changedFile)
    {
        var changed = Normalize(changedFile);
        var expanded = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { changed };
        if (!_files.Contains(changed))
            return expanded;

        var pending = new Queue<string>();
        pending.Enqueue(changed);
        while (pending.Count > 0)
        {
            var dependency = pending.Dequeue();
            if (!_consumers.TryGetValue(dependency, out var consumers))
                continue;
            foreach (var consumer in consumers)
            {
                if (expanded.Add(consumer))
                    pending.Enqueue(consumer);
            }
        }

        return expanded;
    }

    private static SourceDocument? Read(string root, string file)
    {
        try
        {
            var syntax = CSharpSyntaxTree.ParseText(File.ReadAllText(file)).GetRoot();
            var declarations = syntax.DescendantNodes()
                .OfType<BaseTypeDeclarationSyntax>()
                .Select(type => type.Identifier.ValueText)
                .Concat(syntax.DescendantNodes().OfType<DelegateDeclarationSyntax>()
                    .Select(type => type.Identifier.ValueText))
                .Concat(syntax.DescendantNodes().OfType<MethodDeclarationSyntax>()
                    .Where(IsExtensionMethod)
                    .Select(method => method.Identifier.ValueText))
                .Where(name => name.Length > 0)
                .ToHashSet(StringComparer.Ordinal);
            var references = syntax.DescendantNodes()
                .OfType<IdentifierNameSyntax>()
                .Select(identifier => identifier.Identifier.ValueText)
                .Where(name => name.Length > 0)
                .ToHashSet(StringComparer.Ordinal);
            return new SourceDocument(Relative(root, file), declarations, references);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static bool IsExtensionMethod(MethodDeclarationSyntax method) =>
        method.ParameterList.Parameters.FirstOrDefault()?.Modifiers
            .Any(modifier => modifier.IsKind(SyntaxKind.ThisKeyword)) == true;

    private static bool SamePath(string left, string right) =>
        left.Equals(right, StringComparison.OrdinalIgnoreCase);

    private static string Relative(string root, string path) =>
        Normalize(Path.GetRelativePath(root, path));

    private static string Normalize(string path) => path.Replace('\\', '/');

    private sealed record SourceDocument(
        string Path,
        IReadOnlySet<string> Declarations,
        IReadOnlySet<string> References);
}
