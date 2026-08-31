using System.Text.Json;

namespace Skies.Framework.Cli;

/// <summary>The backend proof scope selected from one Git delta.</summary>
/// <param name="Full">Whether every backend test must execute.</param>
/// <param name="Filters">Class/subject fragments used by the framework-owned <c>dotnet test</c> filter.</param>
/// <param name="AffectedSlices">Module/subject keys whose AVP rows must receive runtime verdicts.</param>
internal sealed record BackendImpact(
    bool Full,
    IReadOnlySet<string> Filters,
    IReadOnlySet<string> AffectedSlices,
    IReadOnlySet<string> DirectFilters,
    IReadOnlySet<string> DirectAffectedSlices)
{
    internal BackendImpact(
        bool full,
        IReadOnlySet<string> filters,
        IReadOnlySet<string> affectedSlices)
        : this(full, filters, affectedSlices, filters, affectedSlices)
    {
    }

    /// <summary>Whether this change requires any backend test process.</summary>
    public bool RunsTests => Full || Filters.Count > 0;
}

/// <summary>The runtime proof subset for one frontend package.</summary>
internal sealed class FrontendImpact(FrontendPackage package)
{
    /// <summary>The package being selected.</summary>
    public FrontendPackage Package { get; } = package;

    /// <summary>Whether every runtime proof in this package must run.</summary>
    public bool Full { get; set; }

    /// <summary>Whether ambiguous impact requires an exhaustive fallback at an authoritative boundary.</summary>
    public bool ExhaustiveFallback { get; set; }

    /// <summary>Vitest files selected outside the Assay partition.</summary>
    public HashSet<string> Tests { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Assay files selected for affected ViewModels.</summary>
    public HashSet<string> Assays { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>E2E flows selected by a changed ViewModel, spec, or backend slice.</summary>
    public List<FrontendFlow> Flows { get; } = [];

    /// <summary>Whether the package's rendered design proof was selected by Storybook source.</summary>
    public bool RenderedDesign { get; set; }

    /// <summary>Whether any runtime proof was selected.</summary>
    public bool Selected => Full || ExhaustiveFallback || Tests.Count > 0 || Assays.Count > 0 || Flows.Count > 0
        || RenderedDesign;
}

/// <summary>A normalized executable frontend flow from <c>e2e/flows.json</c>.</summary>
/// <param name="Id">Stable flow identifier.</param>
/// <param name="Target">Canonical execution target (<c>web</c> or <c>native</c>).</param>
/// <param name="Spec">Package-relative Playwright, Maestro, or Flutter integration-test spec.</param>
/// <param name="Features">ViewModel subjects proven by the flow.</param>
/// <param name="BackendSlices">Backend subjects observed by the flow.</param>
internal sealed record FrontendFlow(
    string Id,
    string Target,
    string Spec,
    IReadOnlyList<string> Features,
    IReadOnlyList<string> BackendSlices);

/// <summary>The complete, explainable execution closure for one gate run.</summary>
/// <param name="Backend">Backend runtime selection.</param>
/// <param name="Frontends">Frontend runtime selection, one entry per declared package.</param>
/// <param name="Reasons">Human-readable selection and fallback decisions.</param>
internal sealed record GateImpactPlan(
    BackendImpact Backend,
    IReadOnlyList<FrontendImpact> Frontends,
    IReadOnlyList<string> Reasons);

/// <summary>
/// Expands changed files into the backend AVP/Journey and frontend Assay/E2E closure. Selection is convention-
/// derived; ambiguous production or runtime-wide infrastructure changes widen instead of trusting a skip.
/// Control-plane changes are validated by the doctor without impersonating application impact.
/// </summary>
internal static class GateImpact
{
    /// <summary>Build a fail-closed impact plan from the current workspace inventory.</summary>
    public static GateImpactPlan Build(
        string root,
        IReadOnlyList<string> changes,
        IReadOnlyList<SliceSite> slices,
        IReadOnlyList<AvpProof> proofs,
        IReadOnlyList<JourneyProof> journeys,
        IReadOnlyList<CSharpTestSite> testClasses,
        IReadOnlyList<FrontendPackage> packages)
    {
        var normalized = changes.Select(Normalize).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var reasons = new List<string>();
        var gateControl = normalized.Count(IsGateControlInfrastructure);
        if (gateControl > 0)
        {
            reasons.Add(
                $"gate: {gateControl} control-only path(s) changed; the doctor validates them without widening application proofs");
        }

        var global = normalized.Any(IsRuntimeWideInfrastructure);
        var backend = SelectBackend(root, normalized, slices, proofs, journeys, testClasses, global, reasons);
        var frontend = packages.Select(package => new FrontendImpact(package)).ToList();
        SelectFrontends(root, normalized, frontend, backend, global, reasons);
        return new GateImpactPlan(backend, frontend, reasons);
    }

    private static BackendImpact SelectBackend(
        string root,
        IReadOnlyList<string> changes,
        IReadOnlyList<SliceSite> slices,
        IReadOnlyList<AvpProof> proofs,
        IReadOnlyList<JourneyProof> journeys,
        IReadOnlyList<CSharpTestSite> testClasses,
        bool global,
        List<string> reasons)
    {
        if (global)
        {
            reasons.Add("backend: runtime-wide build infrastructure changed; selecting the full backend");
            return FullBackend();
        }

        var backendRoots = SkiesManifest.BackendPaths(root)
            .Select(path => Normalize(Path.GetRelativePath(root, path))).ToList();
        var filters = new HashSet<string>(StringComparer.Ordinal);
        var affected = new HashSet<string>(StringComparer.Ordinal);
        var directFilters = new HashSet<string>(StringComparer.Ordinal);
        var directAffected = new HashSet<string>(StringComparer.Ordinal);
        var full = false;
        CSharpImpactGraph? csharpGraph = null;

        foreach (var change in changes)
        {
            if (IsDocumentation(change) || IsFrontendPath(change, root))
                continue;

            var backendPath = backendRoots.Any(path => IsWithin(change, path));
            var backendContract = change.EndsWith(".spec.toml", StringComparison.OrdinalIgnoreCase)
                || change.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase)
                || change.EndsWith(".props", StringComparison.OrdinalIgnoreCase)
                || change.EndsWith(".targets", StringComparison.OrdinalIgnoreCase)
                || change.EndsWith(".sln", StringComparison.OrdinalIgnoreCase)
                || change.EndsWith(".slnx", StringComparison.OrdinalIgnoreCase);
            if (backendContract)
            {
                if (change.EndsWith(".spec.toml", StringComparison.OrdinalIgnoreCase))
                {
                    var module = Path.GetFileName(change)[..^".spec.toml".Length];
                    foreach (var slice in slices.Where(slice => slice.Module == module))
                        SelectSlice(slice, directFilters, directAffected, proofs, journeys);
                }
                full = true;
                reasons.Add($"backend: {change} changes the proof/build contract; selecting all tests");
                continue;
            }

            if (!change.EndsWith(".cs", StringComparison.OrdinalIgnoreCase))
                continue;

            foreach (var slice in slices.Where(slice => Normalize(slice.File) == change))
                SelectSlice(slice, directFilters, directAffected, proofs, journeys);
            foreach (var proof in proofs.Where(proof => Normalize(proof.File) == change))
            {
                directFilters.Add(proof.ClassName);
                foreach (var slice in slices.Where(slice =>
                    slice.Module == proof.Module && slice.Name == proof.Subject))
                {
                    SelectSlice(slice, directFilters, directAffected, proofs, journeys);
                }
            }
            foreach (var journey in journeys.Where(journey => Normalize(journey.File) == change))
            {
                directFilters.Add(journey.ClassName);
                foreach (var slice in slices.Where(slice => slice.Name == journey.Subject))
                    SelectSlice(slice, directFilters, directAffected, proofs, journeys);
            }
            foreach (var site in testClasses.Where(site => Normalize(site.File) == change))
                directFilters.Add(site.ClassName);

            csharpGraph ??= CSharpImpactGraph.Build(root);
            var impactedFiles = csharpGraph.Expand(change);
            var matched = false;
            foreach (var slice in slices.Where(slice => impactedFiles.Contains(Normalize(slice.File))))
            {
                SelectSlice(slice, filters, affected, proofs, journeys);
                matched = true;
            }

            foreach (var proof in proofs.Where(proof => impactedFiles.Contains(Normalize(proof.File))))
            {
                filters.Add(proof.ClassName);
                foreach (var slice in slices.Where(slice => slice.Name == proof.Subject))
                    SelectSlice(slice, filters, affected, proofs, journeys);
                matched = true;
            }

            foreach (var journey in journeys.Where(journey => impactedFiles.Contains(Normalize(journey.File))))
            {
                filters.Add(journey.ClassName);
                foreach (var slice in slices.Where(slice => slice.Name == journey.Subject))
                    SelectSlice(slice, filters, affected, proofs, journeys);
                matched = true;
            }

            foreach (var site in testClasses.Where(site => impactedFiles.Contains(Normalize(site.File))))
            {
                filters.Add(site.ClassName);
                matched = true;
            }

            if (matched && impactedFiles.Count > 1)
                reasons.Add($"backend: {change} reaches {impactedFiles.Count - 1} transitive C# consumer(s)");

            if (!matched && backendPath)
            {
                full = true;
                reasons.Add($"backend: {change} has no unambiguous slice binding; selecting all tests");
            }
            else if (!matched)
            {
                full = true;
                reasons.Add($"backend: C# infrastructure {change} changed outside a declared backend; selecting all tests");
            }
        }

        if (full)
            return new BackendImpact(true, filters, affected, directFilters, directAffected);
        if (filters.Count > 0)
            reasons.Add($"backend: selected {affected.Count} slice(s) through {filters.Count} test filter term(s)");
        return new BackendImpact(false, filters, affected, directFilters, directAffected);
    }

    private static void SelectFrontends(
        string root,
        IReadOnlyList<string> changes,
        IReadOnlyList<FrontendImpact> impacts,
        BackendImpact backend,
        bool global,
        List<string> reasons)
    {
        if (global || changes.Any(IsRootFrontendContract))
        {
            foreach (var impact in impacts)
                impact.ExhaustiveFallback = true;
            if (impacts.Count > 0)
                reasons.Add("frontend: shared workspace/gate dependency changed; selecting every frontend proof");
        }

        if (changes.Any(change => change.Contains("client.gen/", StringComparison.OrdinalIgnoreCase)
                                  || change.Contains("/generated/", StringComparison.OrdinalIgnoreCase)))
        {
            foreach (var impact in impacts)
                impact.ExhaustiveFallback = true;
            if (impacts.Count > 0)
                reasons.Add("frontend: generated client changed; selecting every consumer surface");
        }

        var affectedFeatures = new HashSet<string>(StringComparer.Ordinal);
        foreach (var impact in impacts)
        {
            var packageRelative = Normalize(Path.GetRelativePath(root, impact.Package.Path));
            foreach (var change in changes.Where(change => IsWithin(change, packageRelative)))
                SelectPackageChange(root, impact, packageRelative, change, affectedFeatures, reasons);
        }

        if (impacts.Any(impact => impact.Package.Role != FrontendPackageRole.Surface
                                  && impact.ExhaustiveFallback))
        {
            foreach (var impact in impacts)
                impact.ExhaustiveFallback = true;
            reasons.Add("frontend: an unmapped shared core/library change can reach every surface; selecting all packages");
        }

        var backendSubjects = backend.AffectedSlices
            .Select(key => key[(key.IndexOf('/') + 1)..])
            .ToHashSet(StringComparer.Ordinal);
        if (backend.Full)
            backendSubjects.Clear();

        foreach (var impact in impacts)
        {
            var flows = ReadFrontendFlows(impact.Package.Path);
            if (flows is null)
            {
                impact.ExhaustiveFallback = true;
                continue;
            }

            foreach (var flow in flows.Where(flow =>
                         backend.Full
                         || flow.Features.Any(affectedFeatures.Contains)
                         || flow.BackendSlices.Any(backendSubjects.Contains)))
            {
                AddFlow(impact, flow);
                foreach (var feature in flow.Features)
                    affectedFeatures.Add(feature);
            }
        }

        foreach (var feature in affectedFeatures)
            SelectFeatureProofs(impacts, feature);

        foreach (var impact in impacts.Where(impact => impact.Selected))
        {
            reasons.Add(impact.ExhaustiveFallback
                ? $"frontend: {Path.GetFileName(impact.Package.Path)} widened to its full proof surface"
                : $"frontend: {Path.GetFileName(impact.Package.Path)} selected tests={impact.Tests.Count}, "
                  + $"assays={impact.Assays.Count}, rendered={(impact.RenderedDesign ? 1 : 0)}, "
                  + $"flows={impact.Flows.Count}");
        }
    }

    private static void SelectPackageChange(
        string root,
        FrontendImpact impact,
        string packageRelative,
        string change,
        HashSet<string> features,
        List<string> reasons)
    {
        var local = change[packageRelative.Length..].TrimStart('/');
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

    /// <summary>Read the flow inventory used by both impact selection and canonical runner invocation.</summary>
    internal static IReadOnlyList<FrontendFlow>? ReadFrontendFlows(string package)
    {
        var path = Path.Combine(package, "e2e", "flows.json");
        if (!File.Exists(path))
            return [];
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            if (document.RootElement.ValueKind != JsonValueKind.Array)
                return null;
            return document.RootElement.EnumerateArray().Select(flow => new FrontendFlow(
                Text(flow, "id"),
                Text(flow, "target"),
                Normalize(Text(flow, "spec")),
                Strings(flow, "features"),
                Strings(flow, "backendSlices"))).ToList();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? ""
            : "";

    private static IReadOnlyList<string> Strings(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.String)
                .Select(item => item.GetString()!).ToList()
            : [];

    private static void AddFlow(FrontendImpact impact, FrontendFlow flow)
    {
        if (!impact.Flows.Any(existing => existing.Id == flow.Id))
            impact.Flows.Add(flow);
    }

    private static void SelectSlice(
        SliceSite slice,
        HashSet<string> filters,
        HashSet<string> affected,
        IReadOnlyList<AvpProof> proofs,
        IReadOnlyList<JourneyProof> journeys)
    {
        filters.Add(slice.Name);
        affected.Add(slice.Module + "/" + slice.Name);
        foreach (var proof in proofs.Where(proof => proof.Module == slice.Module && proof.Subject == slice.Name))
            filters.Add(proof.ClassName);
        foreach (var journey in journeys.Where(journey => journey.Subject == slice.Name))
            filters.Add(journey.ClassName);
    }

    private static BackendImpact FullBackend() =>
        new(true, new HashSet<string>(StringComparer.Ordinal), new HashSet<string>(StringComparer.Ordinal));

    private static bool TryViewModelName(string file, out string feature)
    {
        const string marker = ".viewModel.";
        var index = file.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        feature = index > 0 ? file[..index] : "";
        return feature.Length > 0;
    }

    private static bool TryFlutterViewModelName(string file, out string feature)
    {
        const string marker = "_view_model.dart";
        feature = file.EndsWith(marker, StringComparison.OrdinalIgnoreCase)
            ? PascalCase(file[..^marker.Length])
            : "";
        return feature.Length > 0;
    }

    private static string PascalCase(string value) => string.Concat(
        value.Split('_', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => char.ToUpperInvariant(part[0]) + part[1..]));

    private static bool IsRuntimeWideInfrastructure(string path) =>
        path.Equals(SkiesManifest.FileName, StringComparison.OrdinalIgnoreCase)
        || path.Equals("global.json", StringComparison.OrdinalIgnoreCase)
        || Path.GetFileName(path).StartsWith("Directory.Build.", StringComparison.OrdinalIgnoreCase);

    private static bool IsGateControlInfrastructure(string path) =>
        path.Equals("lefthook.yml", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith(".github/workflows/", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith(".config/dotnet-tools", StringComparison.OrdinalIgnoreCase);

    private static bool IsRootFrontendContract(string path) =>
        !path.Contains('/') && path is "package.json" or "package-lock.json" or "npm-shrinkwrap.json";

    private static bool IsDocumentation(string path) =>
        path.EndsWith(".md", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith("docs/", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith(".skies/", StringComparison.OrdinalIgnoreCase)
        || Path.GetFileName(path).StartsWith("VERIFICATION", StringComparison.OrdinalIgnoreCase);

    private static bool IsFrontendPath(string path, string root) =>
        SkiesManifest.FrontendPackages(root)
            .Select(package => Normalize(Path.GetRelativePath(root, package.Path)))
            .Any(package => IsWithin(path, package));

    private static bool IsWithin(string path, string directory) =>
        path.Equals(directory, StringComparison.OrdinalIgnoreCase)
        || path.StartsWith(directory.TrimEnd('/') + "/", StringComparison.OrdinalIgnoreCase);

    private static bool SamePath(string left, string right) =>
        Normalize(left).Equals(Normalize(right), StringComparison.OrdinalIgnoreCase);

    private static string Normalize(string path)
    {
        var normalized = path.Replace('\\', '/');
        while (normalized.StartsWith("./", StringComparison.Ordinal))
            normalized = normalized[2..];
        return normalized;
    }
}
