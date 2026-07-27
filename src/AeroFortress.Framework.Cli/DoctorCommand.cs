namespace AeroFortress.Framework.Cli;

/// <summary>
/// The doctor — one verdict over both halves of the stack, extracted from <c>Program</c> so composite
/// commands (<c>af gate</c>) can run the same legs without duplicating them. The backend leg is the
/// build-time Roslyn analyzers (a clean build = a clean bill of health; an AF#### error fails it). The
/// frontend leg, for each manifest-selected AeroFortress harness package, is
/// the TS-world harness: eslint (eslint-plugin-aerofortress, the AFFE* rules) + tsc (the "wired" gate against
/// the generated client). One command, both sides — so nothing is left loose in either direction.
/// </summary>
internal static class DoctorCommand
{
    /// <summary>Run every doctor leg from the current directory; the exit code is the worst leg's.</summary>
    /// <param name="rest">Extra arguments forwarded to the backend <c>dotnet build</c> (e.g. a solution path).</param>
    /// <param name="strictWarnings">
    /// Whether the release gate must promote every compiler, analyzer, ESLint, and loose-endpoint warning to a
    /// blocking finding. The standalone doctor leaves warnings visible while a feature is under construction;
    /// <c>af gate</c> always enables this final-state policy.
    /// </param>
    public static int Run(string[] rest, bool strictWarnings = false)
    {
        var root = Directory.GetCurrentDirectory();
        // The manifest is the topology's source of truth — confirm the project has one and that the paths it
        // declares exist before trusting the rest. A missing manifest is a notice; a broken one fails the doctor.
        var manifest = AeroFortressManifest.Validate(root);
        Console.WriteLine("af doctor — manifest (AeroFortress.toml)...");
        foreach (var message in manifest.Messages)
            Console.Error.WriteLine($"  {message}");

        var foundations = new[]
        {
            (Name: "Not You Again", Outcome: NyaProject.Check(root)),
            (Name: "Right This Way", Outcome: RtwProject.Check(root)),
            (Name: "Now We Can", Outcome: NwcProject.Check(root)),
        };
        foreach (var foundation in foundations)
        {
            Console.WriteLine($"af doctor — {foundation.Name} project protocol...");
            foreach (var message in foundation.Outcome.Messages)
                Console.Error.WriteLine($"  {message}");
        }

        // The anti-desync leg (package-first law): a stale AeroFortress.Framework.* package version or a revived
        // vendored frontend copy fails the doctor. The expected version is baked into this CLI, so the gate fires on
        // CI and on any machine — no sibling framework checkout required.
        var sync = FrameworkSync.Check(root);
        Console.WriteLine("af doctor — framework sync...");
        foreach (var message in sync.Messages)
            Console.Error.WriteLine($"  {message}");

        var legs = new List<Func<int>>
        {
            () =>
            {
                Console.WriteLine("af doctor — backend conventions (build)...");
                return Tooling.Dotnet("build", BuildArguments(rest, strictWarnings));
            },
        };

        foreach (var client in FrontendTargets(root))
        {
            var captured = client;
            legs.Add(() =>
            {
                Console.WriteLine($"af doctor — frontend lint ({Path.GetFileName(captured.Path)})...");
                return FrontendScriptContract.Run(captured.Path, "lint");
            });
            legs.Add(() =>
            {
                Console.WriteLine($"af doctor — frontend typecheck ({Path.GetFileName(captured.Path)})...");
                return FrontendScriptContract.Run(captured.Path, "typecheck");
            });
            if (strictWarnings)
            {
                legs.Add(() => FrontendWarningGate.RunLint(captured.Path));
            }
        }
        if (strictWarnings)
            legs.Add(() => FrontendWarningGate.RunEndpointCoverage(root));

        // Doctor legs are independent, read-only checks. A bounded fan-out avoids making a large monorepo pay their
        // sum serially while respecting the two-core hosted runner and keeping node/compiler memory predictable.
        var degree = Math.Max(2, Math.Min(4, Environment.ProcessorCount));
        using var slots = new SemaphoreSlim(degree, degree);
        var tasks = legs.Select(leg => Task.Run(() =>
        {
            slots.Wait();
            try
            {
                return leg();
            }
            finally
            {
                slots.Release();
            }
        })).ToArray();
        Task.WaitAll(tasks);
        var code = tasks.Max(task => task.Result);
        if (manifest.Present && !manifest.Valid)
            code = Math.Max(code, 1);
        if (manifest.Present && foundations.Any(foundation => !foundation.Outcome.Valid))
            code = Math.Max(code, 1);
        if (sync.Gating && !sync.InSync)
            code = Math.Max(code, 1);

        Console.WriteLine(code == 0 ? "doctor: conventions pass." : "doctor: violations reported above.");
        return code;
    }

    /// <summary>Promote every backend warning at the gate without weakening the interactive doctor.</summary>
    internal static string[] BuildArguments(string[] arguments, bool strictWarnings)
    {
        if (!strictWarnings || arguments.Any(argument =>
                argument.Equals("-warnaserror", StringComparison.OrdinalIgnoreCase)
                || argument.Equals("--warnaserror", StringComparison.OrdinalIgnoreCase)
                || argument.Equals("/warnaserror", StringComparison.OrdinalIgnoreCase)
                || argument.StartsWith("-warnaserror:", StringComparison.OrdinalIgnoreCase)
                || argument.StartsWith("/warnaserror:", StringComparison.OrdinalIgnoreCase)))
            return arguments;

        return [.. arguments, "-warnaserror"];
    }

    // The manifest names every real frontend package. Validation independently inventories ViewModels and flow
    // registries, so deleting a declaration makes the manifest red instead of shrinking this list silently.
    internal static IReadOnlyList<string> FrontendClients(string root)
        => FrontendTargets(root).Select(package => package.Path).ToList();

    /// <summary>Return every manifest-selected frontend package with the proof depth its role owes.</summary>
    internal static IReadOnlyList<FrontendPackage> FrontendTargets(string root)
        => AeroFortressManifest.FrontendPackages(root);
}
