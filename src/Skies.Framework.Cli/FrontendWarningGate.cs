namespace Skies.Framework.Cli;

/// <summary>
/// Promotes release-evidence gaps and loose app-facing endpoints to gate failures. The package-owned lint script
/// still owns project-scoped architecture and design policy; this leg independently invokes the canonical proof
/// rules as errors so a script cannot demote required proof or run endpoint coverage in advisory mode.
/// </summary>
internal static class FrontendWarningGate
{
    /// <summary>Run strict ESLint for one manifest-selected package.</summary>
    internal static int RunLint(FrontendPackage package, string workspace)
    {
        var packageRoot = package.Path;
        var name = Path.GetFileName(packageRoot);
        if (package.Platform == FrontendPlatform.Flutter)
        {
            if (!Directory.Exists(Path.Combine(packageRoot, "lib")))
            {
                Console.Error.WriteLine($"skies gate — Flutter warnings ({name}): package has no lib directory.");
                return 1;
            }
            Console.WriteLine($"skies gate — Flutter evidence ({name}): SKYFL rules are forced at the strict boundary...");
            var arguments = new List<string> { "--no-install", "skies-flutter-doctor", ".", "--strict" };
            if (package.Role != FrontendPackageRole.Surface)
                arguments.Add("--structure-only");
            foreach (var backend in SkiesManifest.BackendPathsForFrontend(workspace, packageRoot))
            {
                arguments.Add("--backend-root");
                arguments.Add(backend);
            }
            return Tooling.Run(
                "npx",
                [.. arguments],
                packageRoot);
        }
        var source = Path.Combine(packageRoot, "src");
        if (!Directory.Exists(source))
        {
            Console.Error.WriteLine($"skies gate — frontend warnings ({name}): package has no src directory.");
            return 1;
        }

        Console.WriteLine(
            $"skies gate — frontend evidence ({name}): mandatory SKYFE proof rules are forced as errors...");
        return Tooling.Run(
            "npx",
            ["--no-install", "skyfe-eslint-gate", "src"],
            packageRoot);
    }

    /// <summary>Run strict app-facing endpoint coverage over every manifest-derived product source union.</summary>
    internal static int RunEndpointCoverage(string workspace)
    {
        var code = 0;
        var environment = new Dictionary<string, string?> { ["SKY_GATE"] = "1" };
        foreach (var target in SkiesManifest.EndpointCoverageTargets(workspace))
        {
            var sourceDirectory = Directory.GetParent(target.ClientPath)!;
            var owner = Directory.GetParent(sourceDirectory.FullName)!.FullName;
            Console.WriteLine(
                $"skies gate — frontend warnings ({Path.GetFileName(owner)}): loose app endpoint budget is zero "
                + $"across {target.SourcePaths.Count} product source root(s)...");
            var arguments = new List<string>
            {
                "--no-install",
                "skyfe-endpoint-coverage",
                "--strict",
                target.ClientPath,
            };
            arguments.AddRange(target.SourcePaths);
            code = Math.Max(code, Tooling.Run("npx", [.. arguments], owner, environment));
        }

        return code;
    }
}
