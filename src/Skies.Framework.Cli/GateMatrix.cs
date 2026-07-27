namespace Skies.Framework.Cli;

/// <summary>A matrix criterion's verdict — the traceability outcome, not the raw test outcome.</summary>
internal enum MatrixVerdict
{
    /// <summary>At least one matching proof ran and passed, and none failed.</summary>
    Pass,

    /// <summary>A matching proof failed (or ended in a non-pass, non-skip outcome).</summary>
    Fail,

    /// <summary>A proof site exists but no decided test outcome was found — a skip is never a pass.</summary>
    NotRun,

    /// <summary>The obligation exists, but the Git-derived impact closure did not select its subject.</summary>
    NotAffected,

    /// <summary>The criterion is declared but no <c>[AVP]</c> site proves it (the SKY0030 gap).</summary>
    NoProof,
}

/// <summary>One traceability row: module × slice × criterion → its proof sites → the verdict.</summary>
/// <param name="Module">The declaring module (from its <c>&lt;Module&gt;.spec.toml</c>).</param>
/// <param name="Slice">The declared slice name.</param>
/// <param name="CriterionId">The catalog criterion id the slice owes.</param>
/// <param name="Proofs">Every <c>[AVP]</c> site carrying this exact subject × criterion pair.</param>
/// <param name="Verdict">The criterion's outcome for this run.</param>
internal sealed record MatrixRow(
    string Module, string Slice, string CriterionId, IReadOnlyList<AvpProof> Proofs, MatrixVerdict Verdict);

/// <summary>A slice a manifest declares that has no <c>[Slice]</c> class in source — a notice, not a failure.</summary>
/// <param name="Module">The manifest's module.</param>
/// <param name="Slice">The declared slice name with no class found.</param>
/// <param name="ManifestPath">The manifest that declares it.</param>
internal sealed record DeclaredWithoutClass(string Module, string Slice, string ManifestPath);

/// <summary>
/// The verification matrix — the gate's artifact. It joins the four evidence sets the scans collect
/// (manifest declarations, <c>[AVP]</c> proof sites, <c>[Slice]</c> inventory, test verdicts) into the
/// traceability the Clockwork gate demands: every declared criterion → a proof → a decided PASS; no orphan
/// proof (creep), no slice declaring nothing, no malformed manifest. Pure — all IO stays in
/// <see cref="GateScan"/> — so every axis is unit-testable.
/// </summary>
internal sealed class GateMatrix
{
    private GateMatrix(
        IReadOnlyList<MatrixRow> rows,
        IReadOnlyList<AvpProof> orphanProofs,
        IReadOnlyList<SliceSite> undeclaredSlices,
        IReadOnlyList<DeclaredWithoutClass> declaredWithoutClass,
        IReadOnlyList<ManifestFile> malformedManifests)
    {
        Rows = rows;
        OrphanProofs = orphanProofs;
        UndeclaredSlices = undeclaredSlices;
        DeclaredWithoutClass = declaredWithoutClass;
        MalformedManifests = malformedManifests;
    }

    /// <summary>The traceability rows, in manifest order (module → slice → criterion).</summary>
    public IReadOnlyList<MatrixRow> Rows { get; }

    /// <summary>Proof sites whose criterion id no manifest declares — scope creep, per the gate's total-matrix rule.</summary>
    public IReadOnlyList<AvpProof> OrphanProofs { get; }

    /// <summary>Slices with no non-empty declaration — the universal SKY0031 axis, mirrored.</summary>
    public IReadOnlyList<SliceSite> UndeclaredSlices { get; }

    /// <summary>Declared slices with no <c>[Slice]</c> class in source (a manifest ahead of its code) — informational.</summary>
    public IReadOnlyList<DeclaredWithoutClass> DeclaredWithoutClass { get; }

    /// <summary>Manifests that exist but could not be parsed — always blocking (a broken contract is no contract).</summary>
    public IReadOnlyList<ManifestFile> MalformedManifests { get; }

    /// <summary>
    /// Whether the matrix alone fails the gate: any selected non-pass verdict, orphan proof, undeclared
    /// slice or malformed manifest. Not-affected rows remain inventory, never counterfeit passes.
    /// </summary>
    public bool Blocking =>
        Rows.Any(r => r.Verdict is not (MatrixVerdict.Pass or MatrixVerdict.NotAffected))
        || OrphanProofs.Count > 0
        || UndeclaredSlices.Count > 0
        || MalformedManifests.Count > 0;

    /// <summary>Join the scanned evidence into the matrix. Pure; order-stable for deterministic reports.</summary>
    /// <param name="manifests">Every discovered <c>*.spec.toml</c> (parsed or malformed).</param>
    /// <param name="proofs">Every subject-bound <c>[AVP]</c> site in source.</param>
    /// <param name="slices">Every <c>[Slice]</c> class in source.</param>
    /// <param name="verdicts">Every test outcome from the run's TRX files.</param>
    /// <param name="executedSlices">
    /// Optional affected scope as <c>Module/Slice</c> keys. Null means a full run; unselected rows remain visible as
    /// <see cref="MatrixVerdict.NotAffected"/> and do not borrow an old or unrelated pass.
    /// </param>
    public static GateMatrix Build(
        IReadOnlyList<ManifestFile> manifests,
        IReadOnlyList<AvpProof> proofs,
        IReadOnlyList<SliceSite> slices,
        IReadOnlyList<TestVerdict> verdicts,
        IReadOnlySet<string>? executedSlices = null)
    {
        var parsed = manifests.Where(m => m.Manifest is not null).ToList();
        var proofsByObligation = proofs
            .GroupBy(p => (p.Module, p.Subject, p.CriterionId))
            .ToDictionary(g => g.Key, g => (IReadOnlyList<AvpProof>)g.ToList());

        var rows = new List<MatrixRow>();
        var declaredObligations = new HashSet<(string Module, string Subject, string Criterion)>();
        var declaredWithoutClass = new List<DeclaredWithoutClass>();
        foreach (var file in parsed)
        {
            var manifest = file.Manifest!;
            foreach (var (slice, criteria) in manifest.Slices)
            {
                if (!slices.Any(s => s.Module == manifest.Module && s.Name == slice))
                    declaredWithoutClass.Add(new DeclaredWithoutClass(manifest.Module, slice, file.Path));
                foreach (var criterion in criteria)
                {
                    declaredObligations.Add((manifest.Module, slice, criterion));
                    var sites = proofsByObligation.TryGetValue((manifest.Module, slice, criterion), out var found)
                        ? found
                        : [];
                    var selected = executedSlices is null || executedSlices.Contains(manifest.Module + "/" + slice);
                    var verdict = sites.Count == 0
                        ? MatrixVerdict.NoProof
                        : selected ? DecideVerdict(sites, verdicts) : MatrixVerdict.NotAffected;
                    rows.Add(new MatrixRow(manifest.Module, slice, criterion, sites, verdict));
                }
            }
        }

        var orphans = proofs
            .Where(p => !declaredObligations.Contains((p.Module, p.Subject, p.CriterionId)))
            .ToList();
        var undeclaredSlices = slices
            .Where(s => !parsed.Any(m =>
                m.Manifest!.Module == s.Module
                && m.Manifest.Slices.TryGetValue(s.Name, out var criteria)
                && criteria.Count > 0))
            .ToList();

        return new GateMatrix(
            rows, orphans, undeclaredSlices, declaredWithoutClass,
            manifests.Where(m => m.Manifest is null).ToList());
    }

    // Every proof site must run and pass. One passing duplicate must never hide another proof that was skipped,
    // failed, or was not discovered by the runner.
    private static MatrixVerdict DecideVerdict(IReadOnlyList<AvpProof> sites, IReadOnlyList<TestVerdict> verdicts)
    {
        var outcomesBySite = sites
            .Select(site => verdicts.Where(v => Matches(v, site)).Select(v => v.Outcome).ToList())
            .ToList();

        if (outcomesBySite.SelectMany(outcomes => outcomes).Any(o => o is not ("Passed" or "NotExecuted")))
            return MatrixVerdict.Fail;
        if (outcomesBySite.Any(outcomes => outcomes.Count == 0 || outcomes.Contains("NotExecuted")))
            return MatrixVerdict.NotRun;
        return outcomesBySite.All(outcomes => outcomes.Count > 0 && outcomes.All(o => o == "Passed"))
            ? MatrixVerdict.Pass
            : MatrixVerdict.NotRun;
    }

    // TRX class names are namespace-qualified; proof classes are bare type names from the textual scan.
    private static bool Matches(TestVerdict verdict, AvpProof proof) =>
        verdict.Method == proof.Method
        && (verdict.ClassName == proof.ClassName
            || verdict.ClassName.EndsWith("." + proof.ClassName, StringComparison.Ordinal));
}
