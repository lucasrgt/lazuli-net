using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace Skies.Framework.Cli;

/// <summary>
/// The anti-desync leg of <c>skies doctor</c> — the enforcement half of the package-first law. A pilot consumes
/// framework behavior through released packages; a stale package declaration or a revived vendored copy is a
/// failure, not an alternate distribution mechanism. The check is <b>self-contained</b>: the version this
/// doctor was released for is baked into the shipped CLI (<see cref="FrameworkPackageVersions"/>), so it gates
/// on CI and on any machine without a sibling framework checkout — the gap that previously let drift through
/// whenever the checkout was absent (it degraded to a harmless notice and the pilot ran an old doctor silently).
/// </summary>
internal static class FrameworkSync
{
    /// <summary>The outcome of the sync check.</summary>
    /// <param name="Gating">Always true — the gate runs from data baked into the CLI, with no precondition.</param>
    /// <param name="InSync">True when nothing drifted.</param>
    /// <param name="Messages">Human-readable failures.</param>
    public record Outcome(bool Gating, bool InSync, IReadOnlyList<string> Messages);

    /// <summary>Run the sync check for the app at <paramref name="root"/>.</summary>
    public static Outcome Check(string root)
    {
        var messages = new List<string>();
        CheckBackendPackageVersions(root, messages);
        CheckAssayPackageVersion(root, messages);
        CheckVendoredFrontendCopies(root, messages);
        return new Outcome(Gating: true, InSync: messages.Count == 0, Messages: messages);
    }

    // Assay is part of the verification protocol, not an arbitrary test dependency. Letting a pilot retain an
    // older host would reintroduce false-green semantics even while the current framework gate appears healthy.
    private static void CheckAssayPackageVersion(string root, List<string> messages)
    {
        var expected = FrameworkPackageVersions.Assay;
        var stale = Directory.EnumerateFiles(root, "*.csproj", SearchOption.AllDirectories)
            .Where(IsConsumerFile)
            .SelectMany(p => Regex.Matches(File.ReadAllText(p), @"Include=""Assay\.Net""\s+Version=""([^""]+)""")
                .Where(m => m.Groups[1].Value != expected)
                .Select(m => $"Assay.Net {m.Groups[1].Value} in {Path.GetFileName(p)}"))
            .Distinct()
            .ToList();

        if (stale.Count > 0)
            messages.Add(
                $"framework-sync: this doctor requires Assay.Net {expected} but the app references "
                + string.Join(", ", stale)
                + $" — bump Assay.Net to {expected}, restore, and run the proofs with the fail-closed protocol host");
    }

    // The app's Skies.Framework.* references must match the version this doctor ships for. The expectation
    // travels baked into the released CLI, so the gate fires on CI and on any machine — a repo-dependent check
    // degraded to a notice when the framework checkout was absent and let a stale pilot run an old doctor silently.
    private static void CheckBackendPackageVersions(string root, List<string> messages)
    {
        var expected = FrameworkPackageVersions.Framework;
        var stale = Directory.EnumerateFiles(root, "*.csproj", SearchOption.AllDirectories)
            .Where(IsConsumerFile)
            .SelectMany(p => Regex.Matches(File.ReadAllText(p), @"Include=""(Skies[^""]*)""\s+Version=""([^""]+)""")
                .Where(m => m.Groups[2].Value != expected)
                .Select(m => $"{m.Groups[1].Value} {m.Groups[2].Value} in {Path.GetFileName(p)}"))
            .Distinct()
            .ToList();

        if (stale.Count > 0)
            messages.Add(
                $"framework-sync: this doctor ships for Skies.Framework.* {expected} but the app references "
                + string.Join(", ", stale)
                + $" — bump the package(s) to {expected}, restore, and fix what the doctor reveals (the package-first law)");
    }

    // The frontend half is enforced self-contained on the npm side by the Skies packages and ESLint plugin.
    // version parity ships in skies-frontend-sdk's framework-sync and runs through the client lint chain,
    // so it is not duplicated here. What stays is the filesystem tell that the retired vendored model was revived.
    private static void CheckVendoredFrontendCopies(string root, List<string> messages)
    {
        var vendoredPlugin = Path.Combine(root, "clients", "eslint-plugin-skies");
        if (Directory.Exists(vendoredPlugin))
            messages.Add(
                "framework-sync: clients/eslint-plugin-skies is a retired vendored plugin copy — delete it "
                + "and consume eslint-plugin-skies from npm");
    }

    private static bool IsConsumerFile(string path) =>
        !path.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            .Any(segment => segment is "node_modules" or ".git" or "bin" or "obj" or "dist");
}
