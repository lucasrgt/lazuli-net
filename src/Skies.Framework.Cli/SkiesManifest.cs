using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Skies.Framework.Cli;

/// <summary>The proof depth a manifest-declared frontend package owes at the release gate.</summary>
internal enum FrontendPackageRole
{
    /// <summary>A shared application core owes executable unit/integration and Assay proofs.</summary>
    Core,

    /// <summary>A reusable workspace library owes executable unit/integration and Assay proofs.</summary>
    Library,

    /// <summary>An executable user surface also owes the E2E contract and real browser/device execution.</summary>
    Surface,
}

/// <summary>A frontend package selected from the workspace manifest and the proof depth it owes.</summary>
/// <param name="Path">The absolute package root.</param>
/// <param name="Role">Whether the package is an application core, reusable library, or executable surface.</param>
internal sealed record FrontendPackage(string Path, FrontendPackageRole Role);

/// <summary>A generated app client and every product source root legally allowed to consume it.</summary>
/// <param name="ClientPath">The absolute conventional <c>src/client.gen</c> directory.</param>
/// <param name="SourcePaths">All core/surface source roots in the same product topology.</param>
internal sealed record EndpointCoverageTarget(string ClientPath, IReadOnlyList<string> SourcePaths);

/// <summary>
/// Reads + validates the workspace manifest, <c>Skies.toml</c> — the single source of truth for an app's
/// topology (which dirs are the backend, the frontend core, and the executable surfaces; which harness gates the
/// build). The manifest was the spine the monorepo design promised but the CLI never read; this is the
/// first reader so <c>skies doctor</c> can confirm a project HAS one and that the paths it declares exist.
///
/// The check is deliberately light (the keys it gates, not a full TOML parse): a missing manifest is a
/// notice (older projects predate it), but a present-yet-broken one — no <c>[workspace]</c>, no name, a
/// declared backend/core path that isn't on disk, or a backend that doesn't pin its dev environment
/// (<see cref="CheckBackendDevEnv"/>) — is a reported failure.
/// </summary>
internal static class SkiesManifest
{
    /// <summary>The manifest filename, at the repo root.</summary>
    public const string FileName = "Skies.toml";

    /// <summary>The outcome of validating a project's manifest.</summary>
    /// <param name="Present">Whether a <see cref="FileName"/> exists at the root.</param>
    /// <param name="Valid">True when present AND every gated check passed.</param>
    /// <param name="Messages">Human-readable notices/failures (one per problem; one notice when absent).</param>
    public record Outcome(bool Present, bool Valid, IReadOnlyList<string> Messages);

    /// <summary>Validate the manifest at <paramref name="root"/>.</summary>
    public static Outcome Validate(string root)
    {
        var path = Path.Combine(root, FileName);
        if (!File.Exists(path))
            return new Outcome(
                Present: false,
                Valid: false,
                Messages: [$"no {FileName} — the workspace manifest is the single source of truth; scaffold one with `skies new`"]);

        var text = File.ReadAllText(path);
        var messages = new List<string>();

        var workspaceSection = Regex.Match(
            text,
            @"(?ms)^\s*\[workspace\]\s*(?<body>.*?)(?=^\s*\[|\z)");
        if (!workspaceSection.Success)
            messages.Add($"{FileName}: missing a [workspace] section");
        else if (!Regex.IsMatch(workspaceSection.Groups["body"].Value, @"^\s*name\s*=", RegexOptions.Multiline))
            messages.Add($"{FileName}: [workspace] declares no name");

        // Every product path must resolve on disk, so the manifest can't drift from the real tree. Frontend and
        // website paths name executable package roots; core may name a directory inside its owning package.
        foreach (Match m in Regex.Matches(
            text,
            @"^\s*(backend|core|library|frontend|website)\s*=\s*""([^""]+)""",
            RegexOptions.Multiline))
        {
            var kind = m.Groups[1].Value;
            var rel = m.Groups[2].Value;
            var full = Path.Combine(root, rel);
            if (!Directory.Exists(full) && !File.Exists(full))
            {
                messages.Add($"{FileName}: {kind} path '{rel}' does not exist");
                continue;
            }

            if (kind == "backend" && Directory.Exists(full))
                CheckBackendDevEnv(full, rel, messages);
            if (kind is "frontend" or "website" && !File.Exists(Path.Combine(full, "package.json")))
                messages.Add($"{FileName}: {kind} path '{rel}' has no package.json");
            if (kind is "core" or "library" && OwningPackage(root, rel) is null)
                messages.Add($"{FileName}: {kind} path '{rel}' has no owning package.json");
        }

        CheckManifestSections(text, messages);
        CheckFrontendInventory(root, text, messages);
        CheckGateWorkflow(root, messages);

        return new Outcome(Present: true, Valid: messages.Count == 0, Messages: messages);
    }

    /// <summary>
    /// Discover the package roots the frontend harness must gate. Product
    /// <c>frontend</c>/<c>website</c>/<c>core</c>/<c>library</c> paths resolve to their owning package while retaining their proof
    /// depth. A core runs tests + Assay; either executable surface kind additionally runs E2E.
    /// Manifest validation independently rejects undisclosed frontend packages, so deleting a declaration cannot
    /// make a proof surface disappear from the release verdict.
    /// </summary>
    public static IReadOnlyList<FrontendPackage> FrontendPackages(string root)
    {
        var path = Path.Combine(root, FileName);
        if (File.Exists(path))
        {
            var text = File.ReadAllText(path);
            var declared = ProductFrontendDeclarations(text)
                .Select(declaration => new
                {
                    Path = OwningPackage(root, declaration.RelativePath),
                    Role = declaration.Kind switch
                    {
                        "core" => FrontendPackageRole.Core,
                        "library" => FrontendPackageRole.Library,
                        _ => FrontendPackageRole.Surface,
                    },
                })
                .Where(package => package.Path is not null)
                .GroupBy(package => package.Path!, StringComparer.OrdinalIgnoreCase)
                .Select(group => new FrontendPackage(
                    group.Key,
                    group.Max(package => package.Role)))
                .ToList();
            return declared;
        }
        return [];
    }

    /// <summary>
    /// Bind each conventional generated client to the union of source roots in its product. This preserves
    /// SKYFE008 across configurable <c>core</c>/<c>frontend</c>/<c>website</c> layouts: an app shell may legally
    /// consume the core's client without either package becoming a false loose-endpoint island.
    /// </summary>
    public static IReadOnlyList<EndpointCoverageTarget> EndpointCoverageTargets(string root)
    {
        var manifestPath = Path.Combine(root, FileName);
        if (!File.Exists(manifestPath))
            return [];

        var targets = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (Match section in ProductSections(File.ReadAllText(manifestPath)))
        {
            var packages = FrontendDeclarations(section.Groups["body"].Value)
                .Select(declaration => OwningPackage(root, declaration.RelativePath))
                .Where(path => path is not null)
                .Select(path => path!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var sources = packages
                .Select(package => Path.Combine(package, "src"))
                .Where(Directory.Exists)
                .ToList();

            foreach (var package in packages)
            {
                var client = Path.Combine(package, "src", "client.gen");
                if (!Directory.Exists(client))
                    continue;
                if (!targets.TryGetValue(client, out var targetSources))
                {
                    targetSources = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    targets.Add(client, targetSources);
                }
                targetSources.UnionWith(sources);
            }
        }

        return targets
            .OrderBy(target => target.Key, StringComparer.OrdinalIgnoreCase)
            .Select(target => new EndpointCoverageTarget(
                target.Key,
                target.Value.OrderBy(path => path, StringComparer.OrdinalIgnoreCase).ToList()))
            .ToList();
    }

    /// <summary>Return every distinct backend root declared by the workspace topology.</summary>
    public static IReadOnlyList<string> BackendPaths(string root)
    {
        var path = Path.Combine(root, FileName);
        if (!File.Exists(path))
            return [];

        return Regex.Matches(
                File.ReadAllText(path),
                @"^\s*backend\s*=\s*""([^""]+)""",
                RegexOptions.Multiline)
            .Select(match => Path.GetFullPath(Path.Combine(root, match.Groups[1].Value)))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string? OwningPackage(string root, string relativePath)
    {
        var workspace = Path.GetFullPath(root);
        var current = Path.GetFullPath(Path.Combine(root, relativePath));
        while (current.StartsWith(workspace + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
               || string.Equals(current, workspace, StringComparison.OrdinalIgnoreCase))
        {
            if (File.Exists(Path.Combine(current, "package.json")))
                return current;
            var parent = Directory.GetParent(current)?.FullName;
            if (parent is null || string.Equals(parent, current, StringComparison.OrdinalIgnoreCase))
                break;
            current = parent;
        }

        return null;
    }

    private sealed record FrontendDeclaration(string Kind, string RelativePath);

    private static IReadOnlyList<FrontendDeclaration> ProductFrontendDeclarations(string text)
    {
        var declarations = new List<FrontendDeclaration>();
        foreach (Match section in ProductSections(text))
            declarations.AddRange(FrontendDeclarations(section.Groups["body"].Value));

        return declarations;
    }

    private static MatchCollection ProductSections(string text) =>
        Regex.Matches(text, @"(?ms)^\s*\[products\.[^\]\r\n]+\]\s*(?<body>.*?)(?=^\s*\[|\z)");

    private static IEnumerable<FrontendDeclaration> FrontendDeclarations(string body) =>
        Regex.Matches(
                body,
                @"^\s*(frontend|website|core|library)\s*=\s*""([^""]+)""",
                RegexOptions.Multiline)
            .Select(entry => new FrontendDeclaration(entry.Groups[1].Value, entry.Groups[2].Value));

    /// <summary>
    /// Keep the workspace schema closed. Verification has no manifest section or mode: its complete depth is an
    /// unconditional framework invariant, so neither a typo nor a newly invented key can become an escape hatch.
    /// </summary>
    private static void CheckManifestSections(string text, List<string> messages)
    {
        foreach (Match section in Regex.Matches(
                     text,
                     @"(?ms)^\s*\[(?<name>[^\]\r\n]+)\]\s*(?<body>.*?)(?=^\s*\[|\z)"))
        {
            var name = section.Groups["name"].Value;
            string[] allowedKeys;
            if (name == "workspace")
                allowedKeys = ["name"];
            else if (name == "framework")
                allowedKeys = ["repo"];
            else if (name.StartsWith("products.", StringComparison.Ordinal))
                allowedKeys = ["backend", "core", "library", "frontend", "website"];
            else
            {
                messages.Add($"{FileName}: unsupported section [{name}] — the manifest only declares topology; verification has no configurable mode.");
                continue;
            }

            foreach (Match entry in Regex.Matches(
                         section.Groups["body"].Value,
                         @"^\s*(?<key>[A-Za-z][A-Za-z0-9_.-]*)\s*=",
                         RegexOptions.Multiline))
            {
                var key = entry.Groups["key"].Value;
                if (!allowedKeys.Contains(key, StringComparer.Ordinal))
                    messages.Add($"{FileName}: unsupported key '{key}' in [{name}] — the manifest only declares topology.");
            }
        }
    }

    /// <summary>
    /// Compare the declared topology with the packages that contain Skies frontend proof surfaces. This
    /// second, filesystem-derived inventory means deleting a product declaration cannot make its ViewModels or E2E
    /// registry disappear from the gate. The manifest must name every owning product package explicitly.
    /// </summary>
    private static void CheckFrontendInventory(string root, string text, List<string> messages)
    {
        var declared = ProductFrontendDeclarations(text)
            .Select(declaration => OwningPackage(root, declaration.RelativePath))
            .Where(path => path is not null)
            .Select(path => path!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var inventoried = DiscoverFrontendProofPackages(root)
            .Concat(DiscoverWorkspacePackages(root))
            .Distinct(StringComparer.OrdinalIgnoreCase);
        foreach (var package in inventoried)
        {
            if (declared.Contains(package))
                continue;

            messages.Add(
                $"{FileName}: workspace/proof package '{Path.GetRelativePath(root, package)}' is not declared by a "
              + "[products.*] frontend, website, core, or library key — undeclared packages cannot disappear from the gate.");
        }
    }

    private static IReadOnlyList<string> DiscoverWorkspacePackages(string root)
    {
        var packageJson = Path.Combine(root, "package.json");
        if (!File.Exists(packageJson))
            return [];

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(packageJson));
            if (!document.RootElement.TryGetProperty("workspaces", out var workspaces))
                return [];
            var entries = workspaces.ValueKind == JsonValueKind.Array
                ? workspaces
                : workspaces.ValueKind == JsonValueKind.Object
                  && workspaces.TryGetProperty("packages", out var packages)
                    ? packages
                    : default;
            if (entries.ValueKind != JsonValueKind.Array)
                return [];

            var candidates = EnumerateFiles(root, "package.json")
                .Select(Path.GetDirectoryName).Where(path => path is not null)
                .Select(path => path!).Where(path => !string.Equals(path, root, StringComparison.OrdinalIgnoreCase))
                .ToList();
            var selected = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var entry in entries.EnumerateArray().Where(entry => entry.ValueKind == JsonValueKind.String))
            {
                var pattern = (entry.GetString() ?? "").Replace('\\', '/').Trim('/');
                if (pattern.Length == 0)
                    continue;
                var regex = "^" + Regex.Escape(pattern)
                    .Replace(@"\*\*", ".*", StringComparison.Ordinal)
                    .Replace(@"\*", "[^/]+", StringComparison.Ordinal) + "$";
                foreach (var candidate in candidates)
                {
                    var relative = Path.GetRelativePath(root, candidate).Replace('\\', '/');
                    if (Regex.IsMatch(relative, regex, RegexOptions.IgnoreCase))
                        selected.Add(candidate);
                }
            }

            return selected.ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static IReadOnlyList<string> DiscoverFrontendProofPackages(string root)
    {
        var packages = new List<string>();
        foreach (var packageJson in EnumerateFiles(root, "package.json"))
        {
            var package = Path.GetDirectoryName(packageJson)!;
            var hasRegistry = File.Exists(Path.Combine(package, "e2e", "flows.json"));
            var source = Path.Combine(package, "src");
            var hasViewModel = Directory.Exists(source)
                && EnumerateFiles(source, "*.viewModel.ts").Concat(EnumerateFiles(source, "*.viewModel.tsx")).Any();
            if (hasRegistry || hasViewModel)
                packages.Add(package);
        }

        return packages;
    }

    private static IEnumerable<string> EnumerateFiles(string root, string pattern)
    {
        var pending = new Stack<string>();
        pending.Push(root);
        while (pending.Count > 0)
        {
            var current = pending.Pop();
            foreach (var file in Directory.EnumerateFiles(current, pattern, SearchOption.TopDirectoryOnly))
                yield return file;

            foreach (var directory in Directory.EnumerateDirectories(current))
            {
                var name = Path.GetFileName(directory);
                if (name is ".git" or ".skies" or "bin" or "coverage" or "dist" or "local-feed"
                    or "node_modules" or "obj" or "output" or "playwright-report" or "TestResults" or "tmp")
                {
                    continue;
                }

                pending.Push(directory);
            }
        }
    }

    /// <summary>
    /// Require the non-bypassable release entry point in CI. Local hooks remain useful feedback, but only a
    /// checked workflow can supply a required status to branch protection after an agent changes the code.
    /// </summary>
    private static void CheckGateWorkflow(string root, List<string> messages)
    {
        var workflows = Path.Combine(root, ".github", "workflows");
        var files = Directory.Exists(workflows)
            ? Directory.EnumerateFiles(workflows, "*.yml").Concat(Directory.EnumerateFiles(workflows, "*.yaml"))
            : [];
        var wired = files.Any(file => WorkflowRunsGate(File.ReadAllText(file)));
        if (!wired)
        {
            messages.Add(
                $"{FileName}: no .github/workflows/*.yml job directly runs `skies gate` — CI must publish the "
              + "release verdict so branch protection can require it.");
        }
    }

    private static bool WorkflowRunsGate(string yaml)
    {
        var withoutComments = string.Join(
            "\n",
            yaml.Split('\n').Where(line => !line.TrimStart().StartsWith('#')));
        var pullRequest = Regex.IsMatch(withoutComments, @"(?im)^\s*pull_request\s*:")
            || Regex.IsMatch(withoutComments, @"(?im)^\s*on\s*:\s*\[[^\]]*\bpull_request\b");
        if (!pullRequest
            || Regex.IsMatch(withoutComments, @"(?im)^\s*(?:-\s*)?continue-on-error\s*:\s*true\b")
            || Regex.IsMatch(withoutComments, @"(?im)^\s*(?:-\s*)?if\s*:\s*(?:\$\{\{\s*)?false\b"))
        {
            return false;
        }

        var invocation = Regex.Match(
            withoutComments,
            @"(?im)^\s*-?\s*run\s*:\s*(?<command>(?:skies(?:\.exe)?\s+gate\b|dotnet\s+tool\s+run\s+skies\s+gate\b|dotnet\s+run\b[^\r\n]*--\s+gate\b)[^\r\n]*)");
        return invocation.Success
            && !Regex.IsMatch(invocation.Groups["command"].Value, @"(?:&&|\|\||;|\s\|\s)");
    }

    /// <summary>
    /// A declared <c>backend</c> (the .NET API) must pin its dev environment in
    /// <c>Properties/launchSettings.json</c>: <c>ASPNETCORE_ENVIRONMENT=Development</c> and an
    /// <c>applicationUrl</c>. Without the file a `dotnet run` silently defaults to <b>Production</b> on the .NET
    /// default port — which both drifts the port the frontend points at and flips on Production-gated behavior
    /// (rate limiting → 429 on register/login). One missing file caused both in a pilot; this catches it at the
    /// doctor instead of at runtime. The check is textual (the keys it gates, not a full JSON parse), matching
    /// the rest of this validator.
    /// </summary>
    private static void CheckBackendDevEnv(string backendDir, string rel, List<string> messages)
    {
        var launchSettings = Path.Combine(backendDir, "Properties", "launchSettings.json");
        if (!File.Exists(launchSettings))
        {
            messages.Add(
                $"{FileName}: backend '{rel}' has no Properties/launchSettings.json — a dev run then defaults to " +
                "Production on the .NET default port (port drift vs the frontend + Production-gated behavior like " +
                "rate limiting → 429s). Pin ASPNETCORE_ENVIRONMENT=Development and an applicationUrl.");
            return;
        }

        var json = File.ReadAllText(launchSettings);
        if (!Regex.IsMatch(json, @"""ASPNETCORE_ENVIRONMENT""\s*:\s*""Development"""))
            messages.Add(
                $"{FileName}: backend '{rel}' launchSettings.json sets no ASPNETCORE_ENVIRONMENT=Development — a dev " +
                "run defaults to Production (rate limiting on → 429 on register/login while iterating locally).");
        if (!Regex.IsMatch(json, @"""applicationUrl""\s*:\s*""[^""]+"""))
            messages.Add(
                $"{FileName}: backend '{rel}' launchSettings.json pins no applicationUrl — the dev port isn't " +
                "deterministic, so the frontend's base URL can't agree with it by construction.");
    }
}
