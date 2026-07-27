namespace Skies.Framework.Cli;

/// <summary>The executable verification legs for one frontend package.</summary>
/// <param name="Client">The client directory name.</param>
/// <param name="Role">The manifest role that decides whether E2E applies.</param>
/// <param name="Tests">The unit/integration test script exit code.</param>
/// <param name="Avp">The Assay/AVP verification script exit code.</param>
/// <param name="FeatureE2e">The workspace feature-to-executable-flow coverage exit code.</param>
/// <param name="E2eShape">The E2E contract exit code, or null for a non-executable package.</param>
/// <param name="E2e">The real E2E runner exit code, or null for a non-executable package.</param>
internal sealed record FrontendGateLeg(
    string Client,
    FrontendPackageRole Role,
    int? Tests,
    int? Avp,
    int FeatureE2e,
    int? E2eShape,
    int? E2e,
    string Scope = "full")
{
    /// <summary>Whether every frontend verification leg ran successfully.</summary>
    public bool Green => Tests is null or 0 && Avp is null or 0 && FeatureE2e == 0
        && (Role != FrontendPackageRole.Surface || E2eShape == 0)
        && E2e is null or 0;
}

/// <summary>Runs every frontend proof suite. Missing scripts/tools fail naturally; nothing is optional.</summary>
internal static class FrontendGate
{
    private const string AssaySuiteGlob = "**/*.assay.test.*";

    /// <summary>
    /// Run the globally structural frontend checks and the runtime subset selected by <paramref name="impacts"/>.
    /// Null means the explicit full audit.
    /// </summary>
    public static IReadOnlyList<FrontendGateLeg> Run(
        string workspace,
        IEnumerable<FrontendPackage> clients,
        IReadOnlyList<FrontendImpact>? impacts = null,
        bool fast = false)
    {
        var targets = clients.ToList();
        var selected = impacts ?? targets.Select(target => new FrontendImpact(target) { Full = true }).ToList();
        var featureCoverage = FeatureCoverage(workspace, targets);
        var legs = new List<FrontendGateLeg>();
        foreach (var target in targets)
        {
            var client = target.Path;
            var name = Path.GetFileName(client);
            var impact = selected.FirstOrDefault(item => SamePackage(item.Package, target))
                ?? new FrontendImpact(target);
            int? tests = null;
            int? avp = null;
            if (impact.Full || impact.Tests.Count > 0)
            {
                Console.WriteLine($"skies gate — frontend tests ({name}, "
                    + (impact.Full ? "full non-Assay partition" : $"{impact.Tests.Count} affected file(s)") + ")...");
                var filters = impact.Full ? [] : impact.Tests.Order().ToArray();
                var arguments = new List<string> { "--" };
                arguments.AddRange(filters);
                arguments.Add($"--exclude={AssaySuiteGlob}");
                tests = FrontendScriptContract.Run(client, "test", [.. arguments]);
            }

            if (impact.Full || impact.Assays.Count > 0)
                avp = RunAssay(client, name, impact.Full ? null : impact.Assays.Order().ToArray());

            int? e2eShape = null;
            int? e2e = null;
            if (target.Role == FrontendPackageRole.Surface)
            {
                Console.WriteLine($"skies gate — frontend E2E contract ({name})...");
                var manifestShape = Tooling.Run("npx", ["--no-install", "skyfe-e2e-doctor", "."], client);
                e2eShape = manifestShape;

                if (!fast && (impact.Full || impact.Flows.Count > 0))
                {
                    var flows = impact.Full ? GateImpact.ReadFrontendFlows(client) : impact.Flows;
                    if (flows is null)
                    {
                        e2e = 1;
                    }
                    else
                    {
                        Console.WriteLine($"skies gate — frontend E2E execution ({name}, "
                            + (impact.Full ? "full" : $"{flows.Count} affected flow(s)") + ")...");
                        e2e = RunE2e(client, flows);
                    }
                }
            }

            var scope = impact.Full ? "full" : impact.Selected ? (fast ? "affected-fast" : "affected") : "not-affected";
            legs.Add(new FrontendGateLeg(name, target.Role, tests, avp, featureCoverage, e2eShape, e2e, scope));
        }

        return legs;
    }

    /// <summary>Run Assay whenever the package owns a ViewModel or an explicit Assay suite.</summary>
    internal static int RunAssay(string client, string name, IReadOnlyList<string>? paths = null)
    {
        if (!RequiresAssay(client))
        {
            Console.WriteLine($"skies gate — frontend AVP ({name}): not applicable (no ViewModel or Assay suite).");
            return 0;
        }

        Console.WriteLine($"skies gate — frontend AVP ({name})...");
        // Invoke Assay directly: a package script is allowed to compose work, but must not be able to replace
        // the acceptance verifier with a placeholder that exits zero.
        var arguments = new List<string> { "--no-install", "assay", "verify" };
        if (paths is not null)
            arguments.AddRange(paths);
        return Tooling.Run("npx", [.. arguments], client);
    }

    /// <summary>Decide whether the universal ViewModel-to-Assay obligation applies to this package.</summary>
    internal static bool RequiresAssay(string client)
    {
        var source = Path.Combine(client, "src");
        if (!Directory.Exists(source))
            return false;

        return Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories)
            .Select(Path.GetFileName)
            .Any(file => file is not null &&
                (file.EndsWith(".viewModel.ts", StringComparison.OrdinalIgnoreCase)
                 || file.EndsWith(".viewModel.tsx", StringComparison.OrdinalIgnoreCase)
                 || file.Contains(".assay.test.", StringComparison.OrdinalIgnoreCase)));
    }

    private static int FeatureCoverage(string workspace, IReadOnlyList<FrontendPackage> targets)
    {
        if (targets.Count == 0)
            return 0;

        Console.WriteLine("skies gate — frontend feature → E2E coverage...");
        var arguments = new List<string> { "--no-install", "skyfe-feature-e2e", workspace };
        arguments.AddRange(targets.Select(target =>
            $"{(target.Role == FrontendPackageRole.Surface ? "surface" : "core")}={target.Path}"));
        var toolRoot = targets.FirstOrDefault(target => target.Role == FrontendPackageRole.Surface)?.Path
            ?? targets[0].Path;
        return Tooling.Run("npx", [.. arguments], toolRoot);
    }

    private static int RunE2e(string client, IReadOnlyList<FrontendFlow> flows)
    {
        var code = 0;
        // A release gate must never attach to an arbitrary dev server that merely answers the same health URL.
        // Playwright's standard `reuseExistingServer: !process.env.CI` convention therefore receives CI=true
        // for the execution leg even when `skies gate` runs locally. SKY_GATE additionally gives custom configs an
        // explicit, tool-owned signal. Manual `playwright test` remains free to reuse servers during development.
        IReadOnlyDictionary<string, string?> gateEnvironment = new Dictionary<string, string?>
        {
            ["CI"] = "true",
            ["SKY_GATE"] = "1",
        };
        var web = flows.Where(flow => flow.Target == "web").Select(flow => flow.Spec)
            .Where(spec => spec.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Order().ToList();
        if (web.Count > 0)
        {
            if (string.Equals(Environment.GetEnvironmentVariable("CI"), "true", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine("skies gate — installing the project-pinned Playwright browsers for the selected web closure...");
                var install = Tooling.Run("npx", ["--no-install", "playwright", "install", "--with-deps"], client);
                if (install != 0)
                    return install;
            }
            code = Math.Max(code, Tooling.Run(
                "npx", ["--no-install", "playwright", "test", .. web], client, gateEnvironment));
        }

        var native = flows.Where(flow => flow.Target == "native").Select(flow => flow.Spec)
            .Where(spec => spec.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Order().ToList();
        if (native.Count > 0)
            code = Math.Max(code, Tooling.Run("maestro", ["test", .. native], client, gateEnvironment));
        return code;
    }

    private static bool SamePackage(FrontendPackage left, FrontendPackage right) =>
        string.Equals(Path.GetFullPath(left.Path), Path.GetFullPath(right.Path), StringComparison.OrdinalIgnoreCase);
}
