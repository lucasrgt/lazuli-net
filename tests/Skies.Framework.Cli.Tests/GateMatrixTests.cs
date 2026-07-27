using Skies.Framework.Cli;
using Assay.Net;

namespace Skies.Framework.Cli.Tests;

public class GateMatrixTests
{
    [Fact]
    public void A_declared_criterion_with_a_passing_proof_is_pass()
    {
        var matrix = GateMatrix.Build(
            [Manifest("Wallets", "[slices.Withdraw]", "criteria = [\"idempotency-key-honored\"]")],
            [new AvpProof("Wallets", "Withdraw", "idempotency-key-honored", "W.Avp.Tests.cs", "WithdrawAvpProof", "Honors_the_key")],
            [new SliceSite("Wallets", "Withdraw", "W.cs")],
            [new TestVerdict("Sample.Tests.WithdrawAvpProof", "Honors_the_key", "Passed")]);

        var row = Assert.Single(matrix.Rows);
        Assert.Equal(MatrixVerdict.Pass, row.Verdict);
        Assert.False(matrix.Blocking);
    }

    [Fact]
    public void A_failing_proof_fails_the_criterion_and_blocks_the_gate()
    {
        var matrix = GateMatrix.Build(
            [Manifest("Wallets", "[slices.Withdraw]", "criteria = [\"idempotency-key-honored\"]")],
            [new AvpProof("Wallets", "Withdraw", "idempotency-key-honored", "W.Avp.Tests.cs", "WithdrawAvpProof", "Honors_the_key")],
            [new SliceSite("Wallets", "Withdraw", "W.cs")],
            [new TestVerdict("Sample.Tests.WithdrawAvpProof", "Honors_the_key", "Failed")]);

        Assert.Equal(MatrixVerdict.Fail, Assert.Single(matrix.Rows).Verdict);
        Assert.True(matrix.Blocking);
    }

    [Fact]
    public void A_declared_criterion_with_no_proof_is_the_SKY0030_gap()
    {
        var matrix = GateMatrix.Build(
            [Manifest("Wallets", "[slices.Withdraw]", "criteria = [\"no-overdraw\"]")],
            proofs: [],
            [new SliceSite("Wallets", "Withdraw", "W.cs")],
            verdicts: []);

        Assert.Equal(MatrixVerdict.NoProof, Assert.Single(matrix.Rows).Verdict);
        Assert.True(matrix.Blocking);
    }

    [Fact]
    public void A_proof_with_no_decided_outcome_is_not_run_never_a_pass()
    {
        // The AVP stance: a skipped/never-executed proof must not read as green.
        var matrix = GateMatrix.Build(
            [Manifest("Wallets", "[slices.Withdraw]", "criteria = [\"idempotency-key-honored\"]")],
            [new AvpProof("Wallets", "Withdraw", "idempotency-key-honored", "W.Avp.Tests.cs", "WithdrawAvpProof", "Honors_the_key")],
            [new SliceSite("Wallets", "Withdraw", "W.cs")],
            [new TestVerdict("Sample.Tests.WithdrawAvpProof", "Honors_the_key", "NotExecuted")]);

        Assert.Equal(MatrixVerdict.NotRun, Assert.Single(matrix.Rows).Verdict);
        Assert.True(matrix.Blocking);
    }

    [Fact]
    public void An_unaffected_criterion_stays_visible_without_counterfeiting_a_pass()
    {
        var matrix = GateMatrix.Build(
            [Manifest("Wallets", "[slices.Withdraw]", "criteria = [\"idempotency-key-honored\"]")],
            [new AvpProof("Wallets", "Withdraw", "idempotency-key-honored", "W.cs", "Proof", "Holds")],
            [new SliceSite("Wallets", "Withdraw", "W.cs")],
            verdicts: [],
            executedSlices: new HashSet<string>());

        Assert.Equal(MatrixVerdict.NotAffected, Assert.Single(matrix.Rows).Verdict);
        Assert.False(matrix.Blocking);
    }

    [Fact]
    public void One_passing_proof_never_hides_a_second_proof_that_did_not_run()
    {
        var matrix = GateMatrix.Build(
            [Manifest("Wallets", "[slices.Withdraw]", "criteria = [\"idempotency-key-honored\"]")],
            [
                new AvpProof("Wallets", "Withdraw", "idempotency-key-honored", "A.cs", "ProofA", "Checks_it"),
                new AvpProof("Wallets", "Withdraw", "idempotency-key-honored", "B.cs", "ProofB", "Checks_it_too"),
            ],
            [new SliceSite("Wallets", "Withdraw", "W.cs")],
            [new TestVerdict("Sample.ProofA", "Checks_it", "Passed")]);

        Assert.Equal(MatrixVerdict.NotRun, Assert.Single(matrix.Rows).Verdict);
        Assert.True(matrix.Blocking);
    }

    [Fact]
    public void A_proof_no_manifest_declares_is_creep()
    {
        var matrix = GateMatrix.Build(
            [Manifest("Wallets", "[slices.Withdraw]", "criteria = [\"idempotency-key-honored\"]")],
            [
                new AvpProof("Wallets", "Withdraw", "idempotency-key-honored", "W.Avp.Tests.cs", "WithdrawAvpProof", "Honors_the_key"),
                new AvpProof("Wallets", "Withdraw", "stray-criterion", "S.Avp.Tests.cs", "StrayProof", "Proves_something_undeclared"),
            ],
            [new SliceSite("Wallets", "Withdraw", "W.cs")],
            [new TestVerdict("Sample.Tests.WithdrawAvpProof", "Honors_the_key", "Passed")]);

        var orphan = Assert.Single(matrix.OrphanProofs);
        Assert.Equal("stray-criterion", orphan.CriterionId);
        Assert.True(matrix.Blocking);
    }

    [Fact]
    public void Any_slice_missing_from_the_manifest_is_reported()
    {
        // The manifest parser itself rejects an empty criterion list; this exercises the remaining inventory gap:
        // a valid module manifest exists, but an independently discovered slice is absent from it.
        var matrix = GateMatrix.Build(
            [Manifest("Payments", "[slices.Refund]", "criteria = [\"returns-captured-funds\"]")],
            proofs: [],
            [new SliceSite("Payments", "Charge", "Charge.cs")],
            verdicts: []);

        var undeclared = Assert.Single(matrix.UndeclaredSlices);
        Assert.Equal("Charge", undeclared.Name);
        Assert.True(matrix.Blocking);
    }

    [Fact]
    public void One_passing_proof_cannot_cover_another_slice_declaring_the_same_id()
    {
        // The binding is module + subject + criterion: two slices can share an invariant, but each owes its proof.
        var matrix = GateMatrix.Build(
            [
                Manifest("Wallets", "[slices.Withdraw]", "criteria = [\"idempotency-key-honored\"]"),
                Manifest("Payments", "[slices.Charge]", "criteria = [\"idempotency-key-honored\"]"),
            ],
            [new AvpProof("Wallets", "Withdraw", "idempotency-key-honored", "W.Avp.Tests.cs", "WithdrawAvpProof", "Honors_the_key")],
            [
                new SliceSite("Wallets", "Withdraw", "W.cs"),
                new SliceSite("Payments", "Charge", "C.cs"),
            ],
            [new TestVerdict("Sample.Tests.WithdrawAvpProof", "Honors_the_key", "Passed")]);

        Assert.Equal(2, matrix.Rows.Count);
        Assert.Equal(MatrixVerdict.Pass, matrix.Rows[0].Verdict);
        Assert.Equal(MatrixVerdict.NoProof, matrix.Rows[1].Verdict);
        Assert.True(matrix.Blocking);
    }

    [Fact]
    public void A_malformed_manifest_blocks_but_a_declared_slice_without_class_is_a_note()
    {
        var broken = new ManifestFile("Broken.spec.toml", null, "spec.toml has no 'module' key.");
        var matrix = GateMatrix.Build(
            [broken, Manifest("Wallets", "[slices.Ghost]", "criteria = [\"idempotency-key-honored\"]")],
            [new AvpProof("Wallets", "Ghost", "idempotency-key-honored", "W.Avp.Tests.cs", "WithdrawAvpProof", "Honors_the_key")],
            slices: [],
            [new TestVerdict("Sample.Tests.WithdrawAvpProof", "Honors_the_key", "Passed")]);

        Assert.Single(matrix.MalformedManifests);
        var note = Assert.Single(matrix.DeclaredWithoutClass);
        Assert.Equal("Ghost", note.Slice);
        Assert.True(matrix.Blocking);

        // Drop the malformed file: only the informational note remains, and the matrix no longer blocks.
        var healthy = GateMatrix.Build(
            [Manifest("Wallets", "[slices.Ghost]", "criteria = [\"idempotency-key-honored\"]")],
            [new AvpProof("Wallets", "Ghost", "idempotency-key-honored", "W.Avp.Tests.cs", "WithdrawAvpProof", "Honors_the_key")],
            slices: [],
            [new TestVerdict("Sample.Tests.WithdrawAvpProof", "Honors_the_key", "Passed")]);
        Assert.Single(healthy.DeclaredWithoutClass);
        Assert.False(healthy.Blocking);
    }

    private static ManifestFile Manifest(string module, params string[] body) =>
        new(module + ".spec.toml",
            SpecManifest.Parse($"module = \"{module}\"\n" + string.Join('\n', body)),
            null);
}
