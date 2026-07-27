using System.Diagnostics;

namespace Skies.Framework.Cli;

/// <summary>A fail-closed Git change discovery result.</summary>
/// <param name="Files">Workspace-relative paths with forward slashes.</param>
/// <param name="Reliable">Whether Git supplied an unambiguous change set.</param>
/// <param name="Message">The fallback reason when discovery was not reliable.</param>
internal sealed record GitChangeSet(IReadOnlyList<string> Files, bool Reliable, string? Message);

/// <summary>Reads the index or revision delta that roots the framework-owned impact calculation.</summary>
internal static class GitChanges
{
    /// <summary>Discover changed paths for <paramref name="options"/>; uncertainty asks the caller for a full run.</summary>
    public static GitChangeSet Read(string root, GateOptions options)
    {
        if (options.Mode == GateMode.Full)
            return new GitChangeSet([], true, null);

        var gitMarker = Path.Combine(root, ".git");
        if (!Directory.Exists(gitMarker) && !File.Exists(gitMarker))
            return new GitChangeSet([], false, "the workspace is not a Git checkout");

        if (options.Mode == GateMode.Staged)
            return Diff(root, ["diff", "--cached", "--name-only", "--diff-filter=ACMRDTUXB", "-z", "--"]);

        var baseRevision = options.BaseRevision ?? Environment.GetEnvironmentVariable("SKY_GATE_BASE");
        var rangeIsExplicit = !string.IsNullOrWhiteSpace(baseRevision);
        if (string.IsNullOrWhiteSpace(baseRevision))
        {
            var originHead = Capture(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
            if (originHead.ExitCode == 0 && !string.IsNullOrWhiteSpace(originHead.Output))
                baseRevision = originHead.Output.Trim();
        }

        if (string.IsNullOrWhiteSpace(baseRevision))
        {
            var working = WorkingTree(root);
            return working.Reliable
                ? working
                : new GitChangeSet([], false, "no --base was supplied and Git could not inspect the working tree");
        }

        var committed = Diff(root,
            ["diff", "--name-only", "--diff-filter=ACMRDTUXB", "-z", $"{baseRevision}...HEAD", "--"]);
        if (!committed.Reliable)
            return new GitChangeSet([], false, $"base revision '{baseRevision}' is unavailable");

        // A caller-supplied base freezes the proof scope to the commits that can actually be pushed or reviewed.
        // The default interactive mode still adds local work so `skies gate` cannot overlook an uncommitted change.
        if (rangeIsExplicit)
            return committed;

        var local = WorkingTree(root);
        if (!local.Reliable)
            return new GitChangeSet([], false, "Git could not inspect local changes on top of HEAD");

        return new GitChangeSet(
            committed.Files.Concat(local.Files).Distinct(StringComparer.OrdinalIgnoreCase).Order().ToList(),
            true,
            null);
    }

    private static GitChangeSet Diff(string root, string[] arguments)
    {
        var result = Capture(root, arguments);
        if (result.ExitCode != 0)
            return new GitChangeSet([], false, result.Error.Trim());

        var files = result.Output.Split('\0', StringSplitOptions.RemoveEmptyEntries)
            .Select(path => path.Replace('\\', '/'))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order()
            .ToList();
        return new GitChangeSet(files, true, null);
    }

    private static GitChangeSet WorkingTree(string root)
    {
        var tracked = Diff(root, ["diff", "--name-only", "--diff-filter=ACMRDTUXB", "-z", "HEAD", "--"]);
        if (!tracked.Reliable)
            return tracked;
        var untracked = Diff(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
        if (!untracked.Reliable)
            return untracked;
        return new GitChangeSet(
            tracked.Files.Concat(untracked.Files).Distinct(StringComparer.OrdinalIgnoreCase).Order().ToList(),
            true,
            null);
    }

    private static (int ExitCode, string Output, string Error) Capture(string root, string[] arguments)
    {
        var info = new ProcessStartInfo("git")
        {
            UseShellExecute = false,
            WorkingDirectory = root,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var argument in arguments)
            info.ArgumentList.Add(argument);

        try
        {
            using var process = Process.Start(info);
            if (process is null)
                return (1, "", "could not start git");
            var output = process.StandardOutput.ReadToEndAsync();
            var error = process.StandardError.ReadToEndAsync();
            process.WaitForExit();
            return (process.ExitCode, output.GetAwaiter().GetResult(), error.GetAwaiter().GetResult());
        }
        catch (System.ComponentModel.Win32Exception exception)
        {
            return (1, "", exception.Message);
        }
    }
}
