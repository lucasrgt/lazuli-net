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
        4. Run focused repository tests and linters during implementation.
        5. Before commit, stage the exact intended paths and run
           `dotnet tool run skies check --task "<completed work>" --staged`. Staged checks are always bounded:
           mapped proofs run, while exhaustive fallbacks and browser/device execution wait for authoritative CI.
        6. Before push, run `dotnet tool run skies check --task "<review>" --base <target-revision> --fast`.
           The pre-push hook repeats this bounded committed-diff review.
        7. Never replace the automation-owned depth gates: pull-request CI runs affected without `--fast`, and
           release automation runs `--full`. Do not report an external delivery complete until its required status
           is green. Bare `skies check --task ...` is intentionally invalid so an ambiguous scope cannot start a
           surprise exhaustive run.
        8. Rerun the same check after every fix. Exit code 1 means findings remain. Exit code 2 or greater
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

    /// <summary>Whether an instruction file carries the current bounded lifecycle.</summary>
    internal static bool IsCurrent(string content)
    {
        var start = content.IndexOf(StartMarker, StringComparison.Ordinal);
        var end = content.IndexOf(EndMarker, StringComparison.Ordinal);
        if (start < 0 || end <= start)
            return false;

        var block = content[start..(end + EndMarker.Length)];
        return block.Contains("dotnet tool run skies context", StringComparison.Ordinal)
            && block.Contains("dotnet tool run skies check", StringComparison.Ordinal)
            && block.Contains("--staged", StringComparison.Ordinal)
            && block.Contains("--base <target-revision> --fast", StringComparison.Ordinal)
            && block.Contains("release automation runs `--full`", StringComparison.Ordinal);
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
