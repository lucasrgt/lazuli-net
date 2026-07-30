namespace Skies.Framework.Cli;

/// <summary>
/// <c>skies gate</c> — the Clockwork done-gate as one deterministic command. It composes the existing legs
/// instead of duplicating them: the doctor (manifest + framework sync + build with the SKY* analyzers,
/// including the SKY0030/SKY0031 bridge + the frontend SKYFE* legs), then the proof run (<c>dotnet test</c>,
/// which executes every <c>[AVP]</c> verification), and finally joins declarations × proofs × verdicts into
/// the traceability matrix. A full audit persists the canonical <c>VERIFICATION.md</c> (for humans, committed
/// with the repo) and <c>VERIFICATION.json</c> (for machines). Change-scoped gates report the same verdict to
/// the console without dirtying the application checkout; their exit code remains the machine contract.
/// </summary>
internal static class GateCommand
{
    private const int MaxInlineFilterLength = 6000;

    /// <summary>The human-facing matrix artifact, written at the workspace root.</summary>
    public const string MarkdownArtifact = "VERIFICATION.md";

    /// <summary>The machine-facing matrix artifact, written at the workspace root.</summary>
    public const string JsonArtifact = "VERIFICATION.json";

    /// <summary>Run the Git-affected gate by default, or the explicitly requested staged/full variant.</summary>
    /// <param name="rest">Gate options and arguments forwarded to the build/test legs.</param>
    public static int Run(string[] rest)
    {
        if (TryWriteHelp(rest, Console.Out))
            return 0;

        var root = Directory.GetCurrentDirectory();
        if (!GateOptions.TryParse(rest, out var options, out var error))
        {
            Console.Error.WriteLine($"skies gate: {error}.");
            return 2;
        }

        var changes = GitChanges.Read(root, options);
        var effectiveFull = options.Mode == GateMode.Full || !changes.Reliable;
        if (!changes.Reliable)
            Console.Error.WriteLine($"skies gate: impact discovery is uncertain ({changes.Message}); widening to full.");

        var manifests = GateScan.DiscoverManifests(root);
        var proofs = GateScan.ScanProofs(root);
        var slices = GateScan.ScanSlices(root);
        var journeys = GateScan.ScanJourneys(root);
        var targets = DoctorCommand.FrontendTargets(root);
        GateImpactPlan impact;
        if (effectiveFull)
        {
            impact = new GateImpactPlan(
                new BackendImpact(true, new HashSet<string>(), new HashSet<string>()),
                targets.Select(target => new FrontendImpact(target) { Full = true }).ToList(),
                ["explicit or fail-closed full gate"]);
        }
        else
        {
            impact = GateImpact.Build(
                root,
                changes.Files,
                slices,
                proofs,
                journeys,
                GateScan.ScanTestClasses(root),
                targets);
        }
        impact = ApplyFastFeedback(impact, options.Fast);

        var scope = effectiveFull ? "full" : options.Mode == GateMode.Staged ? "staged" : "affected";
        if (options.Fast)
            scope += "-fast";
        Console.WriteLine($"skies gate ({scope}) — form ∧ Git-derived proof closure ∧ traceability.");
        if (!effectiveFull)
            Console.WriteLine($"skies gate — {changes.Files.Count} changed path(s) root the impact graph.");
        foreach (var reason in impact.Reasons)
            Console.WriteLine($"  select: {reason}");

        var forwarded = options.ToolArguments.ToArray();
        var suppressions = SuppressionGate.Run(root);
        var doctor = DoctorCommand.Run(forwarded, strictWarnings: true);

        var results = Path.Combine(Path.GetTempPath(), "skies-gate-" + Guid.NewGuid().ToString("N"));
        var tests = 0;
        IReadOnlyList<TestVerdict> verdicts = [];
        if (impact.Backend.RunsTests)
        {
            Console.WriteLine("skies gate — backend proofs (dotnet test)...");
            tests = Tooling.Dotnet("test", ProofArguments(forwarded, doctor, results, impact.Backend));
            verdicts = GateScan.ParseTrxDirectory(results);
        }
        else
        {
            Console.WriteLine("skies gate — backend proofs: not affected.");
        }
        var skippedTests = verdicts.Count(verdict => verdict.Outcome == "NotExecuted");
        TryDelete(results);

        var frontend = FrontendGate.Run(root, targets, impact.Frontends, options.Fast);

        var matrix = GateMatrix.Build(
            manifests,
            proofs,
            slices,
            verdicts,
            impact.Backend.Full ? null : impact.Backend.AffectedSlices);
        var legs = new GateLegs(doctor, tests, frontend, skippedTests, scope);

        GateReport.WriteConsole(matrix, legs, Console.Out);
        if (PersistsArtifacts(options.Mode))
        {
            File.WriteAllText(Path.Combine(root, MarkdownArtifact), GateReport.Markdown(matrix, legs, DateTimeOffset.Now));
            File.WriteAllText(Path.Combine(root, JsonArtifact), GateReport.Json(matrix, legs, DateTimeOffset.Now));
            Console.WriteLine($"gate: wrote {MarkdownArtifact} + {JsonArtifact}.");
        }
        else
        {
            Console.WriteLine("gate: change-scoped verdict emitted without replacing the canonical full-audit artifacts.");
        }

        var code = Math.Max(Math.Max(Math.Max(suppressions, doctor), tests), matrix.Blocking ? 1 : 0);
        if (frontend.Any(leg => !leg.Green))
            code = Math.Max(code, 1);
        if (skippedTests > 0)
            code = Math.Max(code, 1);
        Console.WriteLine(code == 0
            ? "gate: GREEN — form, proofs and the matrix all hold."
            : "gate: RED — a leg failed or the matrix has findings (see above).");
        return code;
    }

    /// <summary>Print gate-specific help before any workspace discovery or proof execution begins.</summary>
    internal static bool TryWriteHelp(IReadOnlyCollection<string> arguments, TextWriter output)
    {
        if (!arguments.Contains("--help") && !arguments.Contains("-h") && !arguments.Contains("-?"))
            return false;

        output.WriteLine(
            """
            skies gate — execute the mandatory proof closure

            usage:
              skies gate [--affected] [--base <rev>] [--fast] [dotnet arguments...]
              skies gate --staged [--fast] [dotnet arguments...]
              skies gate --full [dotnet arguments...]

            modes:
              --affected   select proofs from Git changes; this is the default
              --staged     select proofs from paths currently staged in the Git index
              --full       execute every backend, Assay, and browser/device proof

            options:
              --base <rev> compare <rev>...HEAD in affected mode; local uncommitted paths are excluded
              --fast       keep local feedback bounded; authoritative affected CI executes deferred closures
              -h, --help   print this help without executing the gate

            The gate always runs the universal inventory and rejects caller-authored test filters.
            """);
        return true;
    }

    /// <summary>
    /// Keep local feedback bounded: mapped proof filters still execute, while an exhaustive fallback waits for
    /// the authoritative affected CI or an explicit full audit. The reason remains visible in the plan.
    /// </summary>
    internal static GateImpactPlan ApplyFastFeedback(GateImpactPlan impact, bool fast)
    {
        if (!fast)
            return impact;

        var filter = ProofFilter(impact.Backend);
        var oversized = filter.Length > MaxInlineFilterLength;
        var exhaustiveFrontend = impact.Frontends.Any(frontend => frontend.Full);
        if (!impact.Backend.Full && !oversized && !exhaustiveFrontend)
            return impact;

        var reasons = new List<string>(impact.Reasons);
        if (impact.Backend.Full)
            reasons.Add("backend: exhaustive fallback deferred by --fast; affected CI or an explicit --full audit executes it");
        if (oversized)
            reasons.Add("backend: oversized mapped proof closure deferred by --fast; affected CI executes it without a local command-line fan-out");
        if (exhaustiveFrontend)
            reasons.Add("frontend: exhaustive runtime closure deferred by --fast; affected CI executes every test and Assay");

        return impact with
        {
            Backend = new BackendImpact(
                false,
                oversized ? new HashSet<string>() : impact.Backend.Filters,
                oversized ? new HashSet<string>() : impact.Backend.AffectedSlices),
            Frontends = impact.Frontends
                .Select(frontend => frontend.Full ? BoundedFrontend(frontend) : frontend)
                .ToList(),
            Reasons = reasons,
        };
    }

    private static FrontendImpact BoundedFrontend(FrontendImpact source)
    {
        var bounded = new FrontendImpact(source.Package);
        bounded.Tests.UnionWith(source.Tests);
        bounded.Assays.UnionWith(source.Assays);
        bounded.Flows.AddRange(source.Flows);
        return bounded;
    }

    /// <summary>Build the proof-run arguments, reusing a doctor build only when it actually passed.</summary>
    internal static string[] ProofArguments(
        string[] rest,
        int doctorExit,
        string resultsDirectory,
        BackendImpact? impact = null)
    {
        var arguments = new List<string>(rest);
        if (doctorExit == 0 && !arguments.Contains("--no-build", StringComparer.OrdinalIgnoreCase))
            arguments.Add("--no-build");
        arguments.Add("--logger");
        arguments.Add("trx");
        arguments.Add("--results-directory");
        arguments.Add(resultsDirectory);
        if (impact is { Full: false } && impact.Filters.Count > 0)
        {
            var filter = ProofFilter(impact);
            // Omitting an oversized filter widens to the complete backend suite. It is slower but fail-closed and
            // avoids CreateProcess rejecting the command before a single proof can execute on Windows.
            if (filter.Length <= MaxInlineFilterLength)
            {
                arguments.Add("--filter");
                arguments.Add(filter);
            }
        }
        return [.. arguments];
    }

    private static string ProofFilter(BackendImpact impact) =>
        string.Join('|', impact.Filters.Order().Select(filter => $"FullyQualifiedName~{filter}"));

    /// <summary>Keep the committed attestation stable until an explicitly requested exhaustive audit replaces it.</summary>
    internal static bool PersistsArtifacts(GateMode mode) => mode == GateMode.Full;

    // The TRX scratch dir is disposable; a locked file on Windows must never fail the gate itself.
    private static void TryDelete(string directory)
    {
        try
        {
            if (Directory.Exists(directory))
                Directory.Delete(directory, recursive: true);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }
}
