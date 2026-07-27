namespace Skies.Framework.Cli;

/// <summary>Closes the manifest × AVP proof bridge for CRUD slices emitted by <see cref="CrudGenerator"/>.</summary>
internal static class CrudAcceptance
{
    /// <summary>Returns the acceptance criterion assigned to a generated CRUD slice.</summary>
    public static string CriterionFor(string slice, string entity) => slice[..^entity.Length] switch
    {
        "List" => "returns-stable-page",
        "Lookup" => "returns-requested-resource",
        "LookupMy" => "own-resource-only",
        "Create" => "persists-created-resource",
        "Update" => "persists-requested-change",
        "Delete" => "removes-resource",
        _ => throw new ArgumentOutOfRangeException(nameof(slice)),
    };

    /// <summary>Adds the Assay import and subject-bound proof marker to a rendered co-located test.</summary>
    public static string BindProof(string test, string slice, string criterion)
    {
        var nl = Newline(test);
        if (!test.Contains("using Assay.Net;", StringComparison.Ordinal))
            test = ReplaceFirst(test, "namespace ", "using Assay.Net;" + nl + nl + "namespace ");
        var marker = $"    [AVP(typeof({slice}), \"{criterion}\")]";
        return test.Contains(marker, StringComparison.Ordinal)
            ? test
            : ReplaceFirst(test, "    [Unit]", marker + nl + "    [Unit]");
    }

    /// <summary>Upgrades an existing generated test with its proof marker without replacing its body.</summary>
    public static void EnsureProof(string testPath, string slice, string criterion)
    {
        if (!File.Exists(testPath))
        {
            Console.WriteLine($"note: add a subject-bound AVP proof for {slice}/{criterion}; {testPath} is missing.");
            return;
        }

        var current = File.ReadAllText(testPath);
        var bound = BindProof(current, slice, criterion);
        if (bound == current)
            return;
        File.WriteAllText(testPath, bound);
        Console.WriteLine($"bound {slice}/{criterion} to {testPath}");
    }

    /// <summary>Adds the standalone Assay.Net package to the conventional test project when needed.</summary>
    public static void WireTestProject(string root, string appName)
    {
        var testDir = Path.GetFullPath(Path.Combine(root, "..", "..", "tests", appName + ".Tests"));
        var csproj = Directory.Exists(testDir) ? Directory.GetFiles(testDir, "*.csproj").FirstOrDefault() : null;
        if (csproj is null)
        {
            Console.WriteLine("note: no test project found — add Assay.Net so the generated AVP markers compile.");
            return;
        }

        var text = File.ReadAllText(csproj);
        if (text.Contains("PackageReference Include=\"Assay.Net\"", StringComparison.Ordinal))
            return;
        var nl = Newline(text);
        var version = typeof(Assay.Net.Catalog).Assembly.GetName().Version?.ToString(3)
            ?? throw new InvalidOperationException("Assay.Net assembly has no package-compatible version.");
        text = InsertBeforeClosingItemGroup(
            text, $"    <PackageReference Include=\"Assay.Net\" Version=\"{version}\" />", nl);
        File.WriteAllText(csproj, text);
        Console.WriteLine($"added Assay.Net to {Path.GetFileName(csproj)}");
    }

    private static string InsertBeforeClosingItemGroup(string text, string line, string nl)
    {
        var at = text.IndexOf("</ItemGroup>", StringComparison.Ordinal);
        if (at < 0)
            return text;
        var lineStart = text.LastIndexOf('\n', at) + 1;
        return text[..lineStart] + line + nl + text[lineStart..];
    }

    private static string ReplaceFirst(string text, string find, string replacement)
    {
        var at = text.IndexOf(find, StringComparison.Ordinal);
        return at < 0 ? text : text[..at] + replacement + text[(at + find.Length)..];
    }

    private static string Newline(string text) => text.Contains("\r\n") ? "\r\n" : "\n";
}
