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
        var namespaces = documents.SelectMany(document => document.Namespaces).ToHashSet(StringComparer.Ordinal);
        var qualifiedTypes = documents.SelectMany(document => document.QualifiedTypes).ToHashSet(StringComparer.Ordinal);
        var extensionMethods = documents.SelectMany(document => document.ExtensionMethods).ToHashSet(StringComparer.Ordinal);
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
                if (reference.MemberName && !extensionMethods.Contains(reference.Name)
                    && !ResolvesType(reference, qualifiedTypes, document.Usings))
                    continue;
                if (IsNamespaceReference(reference, namespaces, qualifiedTypes, document.Usings, document.Aliases)
                    || !declarations.TryGetValue(reference.Name, out var declaredBy))
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

        // A global using/alias changes lookup in other files without an explicit import there. Retain that
        // real workspace-wide dependency; ordinary namespace declarations must never create such an edge.
        foreach (var document in documents.Where(document => document.GlobalUsing))
        {
            if (!consumers.TryGetValue(document.Path, out var referencingFiles))
                consumers[document.Path] = referencingFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            referencingFiles.UnionWith(documents.Where(other => other.Path != document.Path).Select(other => other.Path));
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
            // Nested contracts are addressed through their declaring type outside this file. Indexing every
            // Input/Output as a workspace-wide type connects otherwise independent vertical slices.
            var declarations = syntax.DescendantNodes()
                .OfType<BaseTypeDeclarationSyntax>()
                .Where(type => !type.Ancestors().OfType<BaseTypeDeclarationSyntax>().Any())
                .Select(type => type.Identifier.ValueText)
                .Concat(syntax.DescendantNodes().OfType<DelegateDeclarationSyntax>()
                    .Where(type => !type.Ancestors().OfType<BaseTypeDeclarationSyntax>().Any())
                    .Select(type => type.Identifier.ValueText))
                .Concat(syntax.DescendantNodes().OfType<MethodDeclarationSyntax>()
                    .Where(IsExtensionMethod)
                    .Select(method => method.Identifier.ValueText))
                .Where(name => name.Length > 0)
                .ToHashSet(StringComparer.Ordinal);
            var references = syntax.DescendantNodes()
                .OfType<SimpleNameSyntax>()
                .Where(identifier => !IsNamespaceName(identifier))
                .Select(identifier => new SourceReference(identifier.Identifier.ValueText, QualifiedPrefix(identifier), NamespaceOf(identifier).TrimEnd('.'),
                    identifier.Parent is MemberAccessExpressionSyntax access && access.Name == identifier))
                .Where(reference => reference.Name.Length > 0)
                .ToHashSet();
            var namespaces = syntax.DescendantNodes().OfType<BaseNamespaceDeclarationSyntax>()
                .SelectMany(declaration => NamespacePrefixes(NamespaceOf(declaration) + declaration.Name))
                .ToHashSet(StringComparer.Ordinal);
            var qualifiedTypes = syntax.DescendantNodes().OfType<BaseTypeDeclarationSyntax>()
                .Where(type => !type.Ancestors().OfType<BaseTypeDeclarationSyntax>().Any())
                .Select(type => NamespaceOf(type) + type.Identifier.ValueText)
                .ToHashSet(StringComparer.Ordinal);
            var usings = syntax.DescendantNodes().OfType<UsingDirectiveSyntax>()
                .Where(directive => directive.Alias is null && directive.StaticKeyword.IsKind(SyntaxKind.None))
                .Select(directive => directive.Name?.ToString() ?? "").ToHashSet(StringComparer.Ordinal);
            var aliases = syntax.DescendantNodes().OfType<UsingDirectiveSyntax>()
                .Where(directive => directive.Alias is not null)
                .Select(directive => directive.Alias!.Name.Identifier.ValueText).ToHashSet(StringComparer.Ordinal);
            var extensionMethods = syntax.DescendantNodes().OfType<MethodDeclarationSyntax>()
                .Where(IsExtensionMethod).Select(method => method.Identifier.ValueText).ToHashSet(StringComparer.Ordinal);
            var globalUsing = syntax.DescendantNodes().OfType<UsingDirectiveSyntax>().Any(directive => directive.GlobalKeyword.IsKind(SyntaxKind.GlobalKeyword));
            return new SourceDocument(Relative(root, file), declarations, references, namespaces, qualifiedTypes, usings, aliases, extensionMethods, globalUsing);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static bool IsExtensionMethod(MethodDeclarationSyntax method) =>
        method.ParameterList.Parameters.FirstOrDefault()?.Modifiers
            .Any(modifier => modifier.IsKind(SyntaxKind.ThisKeyword)) == true;

    private static bool IsNamespaceName(SimpleNameSyntax name) =>
        name.Ancestors().OfType<BaseNamespaceDeclarationSyntax>()
            .Any(declaration => declaration.Name.Span.Contains(name.Span))
        || name.Ancestors().OfType<UsingDirectiveSyntax>()
            .Any(directive => directive.Alias is null && directive.StaticKeyword.IsKind(SyntaxKind.None));

    private static string? QualifiedPrefix(SimpleNameSyntax name)
    {
        SyntaxNode chain = name;
        while (chain.Parent is QualifiedNameSyntax or MemberAccessExpressionSyntax or AliasQualifiedNameSyntax)
            chain = chain.Parent;
        if (chain == name)
            return null;
        return chain.SyntaxTree.GetText().ToString(Microsoft.CodeAnalysis.Text.TextSpan.FromBounds(chain.SpanStart, name.Span.End))
            .Replace("global::", "", StringComparison.Ordinal);
    }

    private static bool IsNamespaceReference(
        SourceReference reference, IReadOnlySet<string> namespaces, IReadOnlySet<string> types,
        IReadOnlySet<string> usings, IReadOnlySet<string> aliases)
    {
        if (reference.Qualifier is not { } prefix || aliases.Contains(prefix.Split('.')[0]))
            return false;
        if (types.Contains(prefix) || usings.Any(imported => types.Contains(imported + "." + prefix)))
            return false;
        var scope = reference.Namespace;
        while (true)
        {
            var candidate = scope.Length == 0 ? prefix : scope + "." + prefix;
            if (types.Contains(candidate)) return false;
            if (namespaces.Contains(candidate)) return true;
            if (scope.Length == 0) return false;
            var separator = scope.LastIndexOf('.');
            scope = separator < 0 ? "" : scope[..separator];
        }
    }

    private static bool ResolvesType(SourceReference reference, IReadOnlySet<string> types, IReadOnlySet<string> usings)
    {
        if (reference.Qualifier is not { } prefix) return false;
        if (types.Contains(prefix) || usings.Any(imported => types.Contains(imported + "." + prefix))) return true;
        var scope = reference.Namespace;
        while (scope.Length > 0)
        {
            if (types.Contains(scope + "." + prefix)) return true;
            var separator = scope.LastIndexOf('.');
            scope = separator < 0 ? "" : scope[..separator];
        }
        return false;
    }

    private static string NamespaceOf(SyntaxNode node)
    {
        var names = node.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().Reverse().Select(item => item.Name.ToString());
        var value = string.Join('.', names);
        return value.Length == 0 ? "" : value + ".";
    }

    private static IEnumerable<string> NamespacePrefixes(string value)
    {
        var parts = value.Split('.');
        for (var end = 1; end <= parts.Length; end++)
            yield return string.Join('.', parts[..end]);
    }

    private static bool SamePath(string left, string right) =>
        left.Equals(right, StringComparison.OrdinalIgnoreCase);

    private static string Relative(string root, string path) =>
        Normalize(Path.GetRelativePath(root, path));

    private static string Normalize(string path) => path.Replace('\\', '/');

    private sealed record SourceDocument(
        string Path,
        IReadOnlySet<string> Declarations,
        IReadOnlySet<SourceReference> References,
        IReadOnlySet<string> Namespaces,
        IReadOnlySet<string> QualifiedTypes,
        IReadOnlySet<string> Usings,
        IReadOnlySet<string> Aliases,
        IReadOnlySet<string> ExtensionMethods,
        bool GlobalUsing);

    private sealed record SourceReference(string Name, string? Qualifier, string Namespace, bool MemberName);
}
