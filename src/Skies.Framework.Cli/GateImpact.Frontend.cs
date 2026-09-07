namespace Skies.Framework.Cli;

internal static partial class GateImpact
{
    private static void SelectPackageChange(
        string root,
        FrontendImpact impact,
        string packageRelative,
        string change,
        HashSet<string> features,
        List<string> reasons)
    {
        var local = change[packageRelative.Length..].TrimStart('/');
        if (GeneratedClientImpact.IsGenerated(local))
            return;
        if (IsRenderedDesignInfrastructure(local))
        {
            impact.RenderedDesign = true;
            reasons.Add($"frontend: {change} maps to the package rendered-design proof without widening runtime tests");
            return;
        }

        if (local.StartsWith("src/storybook/", StringComparison.OrdinalIgnoreCase))
        {
            impact.RenderedDesign = true;
            var source = Path.Combine(impact.Package.Path, local.Replace('/', Path.DirectorySeparatorChar));
            if (impact.Package.Platform == FrontendPlatform.Flutter)
                SelectFlutterSiblingTests(impact, local);
            else
                SelectSiblingTests(impact, source);
            reasons.Add($"frontend: {change} maps to the package rendered-design proof without widening runtime tests");
            return;
        }

        if (impact.Package.Platform == FrontendPlatform.Flutter)
        {
            SelectFlutterPackageChange(impact, local, change, features, reasons);
            return;
        }

        if (local is "package.json" or "tsconfig.json" || local.EndsWith("config.ts", StringComparison.OrdinalIgnoreCase)
            || local.EndsWith("config.js", StringComparison.OrdinalIgnoreCase) || local == "e2e/flows.json")
        {
            impact.ExhaustiveFallback = true;
            return;
        }

        if (local.StartsWith("e2e/", StringComparison.OrdinalIgnoreCase))
        {
            var flow = ReadFrontendFlows(impact.Package.Path)?.Where(flow => SamePath(flow.Spec, local)).ToList() ?? [];
            if (flow.Count == 0)
                impact.ExhaustiveFallback = true;
            else
                flow.ForEach(item => AddFlow(impact, item));
            return;
        }

        if (!local.StartsWith("src/", StringComparison.OrdinalIgnoreCase))
            return;

        var absolute = Path.Combine(impact.Package.Path, local.Replace('/', Path.DirectorySeparatorChar));
        var file = Path.GetFileName(local);
        var directTest = false;
        if (file.Contains(".assay.test.", StringComparison.OrdinalIgnoreCase))
        {
            impact.Assays.Add(local);
            directTest = true;
        }
        else if (file.Contains(".test.", StringComparison.OrdinalIgnoreCase)
                 || file.Contains(".spec.", StringComparison.OrdinalIgnoreCase))
        {
            impact.Tests.Add(local);
            directTest = true;
        }

        if (directTest)
            return;

        if (local.StartsWith("src/features/", StringComparison.OrdinalIgnoreCase)
            && file.Contains(".i18n.", StringComparison.OrdinalIgnoreCase))
        {
            var featureRoot = Path.GetDirectoryName(absolute)!;
            foreach (var source in Directory.EnumerateFiles(featureRoot, "*.viewModel.*", SearchOption.AllDirectories))
                if (TryViewModelName(Path.GetFileName(source), out var feature))
                    features.Add(feature);
            foreach (var test in Directory.EnumerateFiles(featureRoot, "*.test.*", SearchOption.AllDirectories))
                SelectSiblingTests(impact, test);
            SelectSiblingTests(impact, Path.Combine(impact.Package.Path, "src/i18n/resources.ts"));
            if (features.Count > 0 || impact.Tests.Count > 0 || impact.Assays.Count > 0)
            {
                reasons.Add($"frontend: {change} selects its feature subtree and i18n validation");
                return;
            }
        }

        if (IsViewSource(file))
        {
            SelectViewTests(impact, absolute);
            if (FrontendScriptContract.HasScript(impact.Package.Path, "design:rendered"))
                impact.RenderedDesign = true;

            if (impact.Tests.Count > 0 || impact.Assays.Count > 0)
            {
                reasons.Add($"frontend: {change} maps to its feature tests"
                            + (impact.RenderedDesign ? " and rendered-design proof" : "")
                            + " without widening every runtime proof");
                return;
            }
        }

        if (TryViewModelName(file, out var directFeature))
        {
            features.Add(directFeature);
            return;
        }

        var directory = File.Exists(absolute) ? Path.GetDirectoryName(absolute)! : Path.GetDirectoryName(absolute)!;
        var viewModels = Directory.Exists(directory)
            ? Directory.EnumerateFiles(directory, "*.viewModel.*", SearchOption.TopDirectoryOnly)
                .Select(Path.GetFileName).Where(name => TryViewModelName(name!, out _)).ToList()
            : [];
        if (viewModels.Count == 0)
        {
            impact.ExhaustiveFallback = true;
            return;
        }

        foreach (var viewModel in viewModels)
            if (TryViewModelName(viewModel!, out var feature))
                features.Add(feature);
    }

    private static void SelectFlutterPackageChange(
        FrontendImpact impact,
        string local,
        string change,
        HashSet<string> features,
        List<string> reasons)
    {
        if (local is "package.json" or "pubspec.yaml" or "analysis_options.yaml" or "e2e/flows.json"
            || local.EndsWith("config.dart", StringComparison.OrdinalIgnoreCase))
        {
            impact.ExhaustiveFallback = true;
            return;
        }

        if (local.StartsWith("integration_test/", StringComparison.OrdinalIgnoreCase))
        {
            var flows = ReadFrontendFlows(impact.Package.Path)?.Where(flow => SamePath(flow.Spec, local)).ToList() ?? [];
            if (flows.Count == 0)
                impact.ExhaustiveFallback = true;
            else
                flows.ForEach(flow => AddFlow(impact, flow));
            return;
        }

        if (local.StartsWith("test/", StringComparison.OrdinalIgnoreCase))
        {
            if (local.EndsWith(".assay_test.dart", StringComparison.OrdinalIgnoreCase))
                impact.Assays.Add(local);
            else if (local.EndsWith("_test.dart", StringComparison.OrdinalIgnoreCase))
                impact.Tests.Add(local);
            return;
        }

        if (!local.StartsWith("lib/", StringComparison.OrdinalIgnoreCase))
            return;

        var file = Path.GetFileName(local);
        if (TryFlutterViewModelName(file, out var feature))
        {
            features.Add(feature);
            SelectFlutterSiblingTests(impact, local);
            reasons.Add($"frontend: {change} maps to its Flutter feature tests without widening every runtime proof");
            return;
        }
        if (file.EndsWith("_view.dart", StringComparison.OrdinalIgnoreCase))
        {
            var selectedBefore = impact.Tests.Count + impact.Assays.Count;
            SelectFlutterSiblingTests(impact, local);
            if (impact.Tests.Count + impact.Assays.Count == selectedBefore)
            {
                impact.ExhaustiveFallback = true;
                reasons.Add($"frontend: {change} has no mirrored Flutter widget proof; selecting the full package");
                return;
            }
            reasons.Add($"frontend: {change} maps to its Flutter widget proof without widening every runtime proof");
            return;
        }

        var absolute = Path.Combine(impact.Package.Path, local.Replace('/', Path.DirectorySeparatorChar));
        var directory = Path.GetDirectoryName(absolute)!;
        var viewModels = Directory.Exists(directory)
            ? Directory.EnumerateFiles(directory, "*_view_model.dart", SearchOption.TopDirectoryOnly).ToList()
            : [];
        if (viewModels.Count == 0)
        {
            impact.ExhaustiveFallback = true;
            return;
        }
        foreach (var viewModel in viewModels)
        {
            if (TryFlutterViewModelName(Path.GetFileName(viewModel), out var adjacentFeature))
                features.Add(adjacentFeature);
            SelectFlutterSiblingTests(
                impact,
                Normalize(Path.GetRelativePath(impact.Package.Path, viewModel)));
        }
    }

    private static void SelectFlutterSiblingTests(FrontendImpact impact, string sourceRelative)
    {
        var sourceDirectory = Path.GetDirectoryName(sourceRelative.Replace('/', Path.DirectorySeparatorChar)) ?? "lib";
        var relativeDirectory = Path.GetRelativePath("lib", sourceDirectory);
        var testDirectory = Path.Combine(impact.Package.Path, "test", relativeDirectory);
        if (!Directory.Exists(testDirectory))
            return;
        foreach (var test in Directory.EnumerateFiles(testDirectory, "*_test.dart", SearchOption.TopDirectoryOnly))
        {
            var relative = Normalize(Path.GetRelativePath(impact.Package.Path, test));
            if (test.EndsWith(".assay_test.dart", StringComparison.OrdinalIgnoreCase))
                impact.Assays.Add(relative);
            else
                impact.Tests.Add(relative);
        }
    }

    private static bool IsRenderedDesignInfrastructure(string local) =>
        local.StartsWith(".storybook/", StringComparison.OrdinalIgnoreCase)
        || local.StartsWith("design-e2e/", StringComparison.OrdinalIgnoreCase)
        || local.Equals("playwright.design.config.ts", StringComparison.OrdinalIgnoreCase)
        || local.Equals("playwright.design.config.js", StringComparison.OrdinalIgnoreCase);

    private static bool IsViewSource(string file) =>
        file.Contains(".view.", StringComparison.OrdinalIgnoreCase);

    private static void SelectViewTests(FrontendImpact impact, string absolute)
    {
        var source = Path.Combine(impact.Package.Path, "src");
        var features = Path.Combine(source, "features");
        var directory = Path.GetDirectoryName(absolute)!;

        while (IsWithinDirectory(directory, source) && !SameDirectory(directory, features))
        {
            SelectSiblingTests(impact, Path.Combine(directory, Path.GetFileName(absolute)));
            directory = Path.GetDirectoryName(directory)!;
        }
    }

    private static bool IsWithinDirectory(string path, string parent)
    {
        var relative = Path.GetRelativePath(parent, path);
        return relative != ".."
               && !relative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
               && !Path.IsPathRooted(relative);
    }

    private static bool SameDirectory(string left, string right) =>
        string.Equals(Path.GetFullPath(left).TrimEnd(Path.DirectorySeparatorChar),
            Path.GetFullPath(right).TrimEnd(Path.DirectorySeparatorChar),
            OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);

    private static void SelectSiblingTests(FrontendImpact impact, string absolute)
    {
        var directory = Path.GetDirectoryName(absolute)!;
        if (!Directory.Exists(directory))
            return;

        foreach (var test in Directory.EnumerateFiles(directory, "*.test.*", SearchOption.TopDirectoryOnly))
        {
            var relative = Normalize(Path.GetRelativePath(impact.Package.Path, test));
            if (Path.GetFileName(test).Contains(".assay.test.", StringComparison.OrdinalIgnoreCase))
                impact.Assays.Add(relative);
            else
                impact.Tests.Add(relative);
        }
    }

    private static void SelectFeatureProofs(IReadOnlyList<FrontendImpact> impacts, string feature)
    {
        foreach (var impact in impacts)
        {
            if (impact.Package.Platform == FrontendPlatform.Flutter)
            {
                var flutterSource = Path.Combine(impact.Package.Path, "lib", "features");
                if (!Directory.Exists(flutterSource))
                    continue;
                foreach (var viewModel in Directory.EnumerateFiles(
                             flutterSource,
                             "*_view_model.dart",
                             SearchOption.AllDirectories).Where(path =>
                             TryFlutterViewModelName(Path.GetFileName(path), out var candidate)
                             && candidate.Equals(feature, StringComparison.OrdinalIgnoreCase)))
                {
                    SelectFlutterSiblingTests(
                        impact,
                        Normalize(Path.GetRelativePath(impact.Package.Path, viewModel)));
                }
                continue;
            }
            var source = Path.Combine(impact.Package.Path, "src");
            if (!Directory.Exists(source))
                continue;
            foreach (var viewModel in Directory.EnumerateFiles(source, feature + ".viewModel.*", SearchOption.AllDirectories))
            {
                var directory = Path.GetDirectoryName(viewModel)!;
                foreach (var test in Directory.EnumerateFiles(directory, "*.test.*", SearchOption.TopDirectoryOnly))
                {
                    var relative = Normalize(Path.GetRelativePath(impact.Package.Path, test));
                    if (Path.GetFileName(test).Contains(".assay.test.", StringComparison.OrdinalIgnoreCase))
                        impact.Assays.Add(relative);
                    else
                        impact.Tests.Add(relative);
                }
            }
        }
    }

}
