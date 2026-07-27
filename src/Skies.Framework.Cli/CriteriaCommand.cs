using Assay.Net;

namespace Skies.Framework.Cli;

/// <summary>
/// <c>skies criteria</c> — the AVP catalog as a menu. <c>list</c> prints every archetype and criterion the
/// neutral catalog defines, marking which ones the referenced Assay.Net can actually RUN (a mechanical
/// oracle bound in this adapter) — the honest partition between "bindable today" and "definition only".
/// <c>suggest</c> matches a slice's words against the archetype families (the Clockwork hybrid: the
/// heuristic proposes with its reasons, a human or the LLM refines) so declaring criteria starts from a
/// shortlist instead of a blank page.
/// </summary>
internal static class CriteriaCommand
{
    /// <summary>Dispatch <c>skies criteria list|suggest</c>.</summary>
    public static int Run(string[] rest) => rest switch
    {
        ["list"] => List(),
        ["suggest", .. var terms] when terms.Length > 0 => Suggest(terms),
        _ => Usage(),
    };

    private static int List()
    {
        var catalog = Catalog.LoadDefault();
        Console.WriteLine($"AVP catalog {catalog.ProtocolVersion} — {catalog.Archetypes.Count} archetypes, "
                        + $"{catalog.Archetypes.Sum(a => a.Criteria.Count)} criteria "
                        + $"(Assay.Net {typeof(Catalog).Assembly.GetName().Version?.ToString(3)})");
        foreach (var archetype in catalog.Archetypes)
        {
            Console.WriteLine();
            Console.WriteLine($"  {archetype.Archetype} — {Runners(archetype.Archetype)}");
            foreach (var criterion in archetype.Criteria)
                Print(criterion);
        }

        return 0;
    }

    private static int Suggest(string[] terms)
    {
        var tokens = terms.SelectMany(CriteriaHeuristic.Tokenize).ToList();
        var ranked = CriteriaHeuristic.Rank(tokens);
        if (ranked.Count == 0)
        {
            Console.WriteLine($"no archetype family matches '{string.Join(' ', terms)}' — run `skies criteria list` for the full menu.");
            return 0;
        }

        var catalog = Catalog.LoadDefault();
        Console.WriteLine($"criteria suggested for '{string.Join(' ', terms)}' (heuristic proposes — you refine):");
        foreach (var (archetype, words) in ranked)
        {
            var spec = catalog.Archetypes.FirstOrDefault(a => a.Archetype == archetype);
            if (spec is null)
                continue;
            Console.WriteLine();
            Console.WriteLine($"  {archetype} — matched: {string.Join(", ", words)} — {Runners(archetype)}");
            foreach (var criterion in spec.Criteria)
                Print(criterion);
        }

        Console.WriteLine();
        Console.WriteLine("declare the chosen ids at scaffold time: skies g slice <Module> <Name> --verify <id,id>");
        return 0;
    }

    private static void Print(Criterion criterion)
    {
        var runnable = criterion.Oracle == "mechanical" && AvpBinding.For(criterion.Id).Count > 0;
        Console.WriteLine($"    {criterion.Id,-34} [{criterion.Oracle}{(runnable ? ", runnable" : "")}] {criterion.Statement}");
        if (criterion.SeenIn is { Count: > 0 } seenIn)
            Console.WriteLine($"      seen in: {string.Join("; ", seenIn)}");
    }

    // How this criterion's archetype can run here: the concrete Assay.Net class(es), or definition-only.
    private static string Runners(string archetype)
    {
        var bindings = AvpBinding.All.Where(b => b.Name == archetype).ToList();
        return bindings.Count == 0
            ? "no .NET runner in this Assay.Net (definition only)"
            : "runner: " + string.Join(", ", bindings.Select(b => $"{b.ArchetypeType.Name}/{b.SubjectType.Name}"));
    }

    private static int Usage()
    {
        Console.Error.WriteLine(
            """
            skies criteria — the AVP catalog menu

            usage:
              skies criteria list                      every archetype + criterion, with what Assay.Net can run
              skies criteria suggest <words...>        rank archetype families for a slice (e.g. `skies criteria suggest CreateCheckout`)
            """);
        return 1;
    }
}
