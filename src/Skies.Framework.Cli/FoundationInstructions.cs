namespace Skies.Framework.Cli;

/// <summary>Owns the single agent instruction block for the complete foundation lifecycle.</summary>
internal static class FoundationInstructions
{
    internal const string StartMarker = "<!-- skies:foundations:start -->";
    internal const string EndMarker = "<!-- skies:foundations:end -->";

    private static readonly IReadOnlyList<(string Start, string End)> RetiredMarkers =
    [
        ("<!-- nya:instructions:start -->", "<!-- nya:instructions:end -->"),
        ("<!-- wtw:instructions:start -->", "<!-- wtw:instructions:end -->"),
        ("<!-- rtw:instructions:start -->", "<!-- rtw:instructions:end -->"),
        ("<!-- nwc:instructions:start -->", "<!-- nwc:instructions:end -->"),
        (StartMarker, EndMarker),
    ];

    internal static string Block =>
        """
        <!-- skies:foundations:start -->
        ## Skies foundation workflow

        The primary coding agent owns the complete foundation lifecycle. Never create or
        delegate one agent per foundation.

        1. At task start, run `dotnet tool run skies context --task "<goal>" --path <expected-path>`.
           Treat every returned decision, invariant, way, scar, and due deferment as governing context.
        2. Rerun `dotnet tool run skies context` after scope changes, context compaction, or movement into
           an unfamiliar area. Keep retrieval bounded with accurate task text and paths.
        3. Use the repository-local foundation skills only when a real lifecycle event occurs: accepted
           decisions for WTW, proven patterns for RTW, corrected failures for NYA, or evidence-backed
           conditional deferments for NWC. Never record hypothetical guidance.
        4. Run the repository's ordinary tests and linters during implementation.
        5. Before commit or completion, run `dotnet tool run skies check --task "<completed work>"`.
           For committed review or pre-push review, add `--base <target-revision>`. For a release, use `--full`.
        6. Rerun the same check after every fix. Exit code 1 means findings remain. Exit code 2 or greater
           means validation was incomplete. Neither is a pass.

        Tests, linters, review, and individual foundation commands do not replace `skies check`.
        <!-- skies:foundations:end -->
        """;

    internal static void Write(string root, IReadOnlyList<string> agentFiles)
    {
        foreach (var relative in agentFiles)
        {
            var path = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory))
                Directory.CreateDirectory(directory);
            var content = File.Exists(path) ? File.ReadAllText(path) : "";
            File.WriteAllText(path, Consolidate(content));
        }
    }

    internal static string Consolidate(string content)
    {
        var result = content;
        foreach (var marker in RetiredMarkers)
            result = RemoveBlock(result, marker.Start, marker.End);
        result = result.TrimEnd();
        return string.IsNullOrEmpty(result)
            ? Block + Environment.NewLine
            : result + Environment.NewLine + Environment.NewLine + Block + Environment.NewLine;
    }

    private static string RemoveBlock(string content, string startMarker, string endMarker)
    {
        while (true)
        {
            var start = content.IndexOf(startMarker, StringComparison.Ordinal);
            if (start < 0)
                return content;
            var end = content.IndexOf(endMarker, start + startMarker.Length, StringComparison.Ordinal);
            if (end < 0)
                return content.Remove(start).TrimEnd();
            content = content.Remove(start, end + endMarker.Length - start).TrimEnd();
        }
    }
}
