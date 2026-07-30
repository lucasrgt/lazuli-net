using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class GateCommandTests
{
    [Fact]
    public void The_release_gate_promotes_backend_warnings()
    {
        var arguments = DoctorCommand.BuildArguments(["App.slnx", "-c", "Release"], strictWarnings: true);

        Assert.Contains("-warnaserror", arguments);
    }

    [Fact]
    public void The_interactive_doctor_keeps_warnings_advisory()
    {
        var arguments = DoctorCommand.BuildArguments(["App.slnx"], strictWarnings: false);

        Assert.DoesNotContain("-warnaserror", arguments);
    }

    [Theory]
    [InlineData("-warnaserror")]
    [InlineData("--warnaserror")]
    [InlineData("/warnaserror")]
    [InlineData("-warnaserror:SKY0026")]
    public void An_explicit_warning_policy_is_not_duplicated(string option)
    {
        var arguments = DoctorCommand.BuildArguments(["App.slnx", option], strictWarnings: true);

        Assert.Equal(1, arguments.Count(argument => argument.Contains("warnaserror", StringComparison.OrdinalIgnoreCase)));
    }

    [Fact]
    public void A_green_doctor_reuses_its_successful_build_for_the_proof_run()
    {
        var arguments = GateCommand.ProofArguments(["App.slnx", "-c", "Release"], 0, "evidence");

        Assert.Contains("--no-build", arguments);
        Assert.Equal("evidence", arguments[^1]);
    }

    [Fact]
    public void A_failed_doctor_never_reuses_potentially_stale_binaries()
    {
        var arguments = GateCommand.ProofArguments(["App.slnx"], 1, "evidence");

        Assert.DoesNotContain("--no-build", arguments);
    }

    [Fact]
    public void The_affected_filter_is_derived_from_the_impact_plan()
    {
        var impact = new BackendImpact(
            false,
            new HashSet<string> { "LoginProof", "AuthJourney" },
            new HashSet<string> { "Account/Login" });

        var arguments = GateCommand.ProofArguments(["App.slnx"], 0, "evidence", impact);

        var filter = arguments[Array.IndexOf(arguments, "--filter") + 1];
        Assert.Contains("FullyQualifiedName~LoginProof", filter);
        Assert.Contains("FullyQualifiedName~AuthJourney", filter);
    }

    [Fact]
    public void Fast_feedback_defers_an_exhaustive_backend_fallback_without_calling_it_passed()
    {
        var frontend = new FrontendImpact(new FrontendPackage("clients/web", FrontendPackageRole.Surface))
        {
            Full = true,
        };
        var impact = new GateImpactPlan(
            new BackendImpact(true, new HashSet<string>(), new HashSet<string>()),
            [frontend],
            ["runtime-wide contract changed"]);

        var bounded = GateCommand.ApplyFastFeedback(impact, fast: true);

        Assert.False(bounded.Backend.RunsTests);
        Assert.False(Assert.Single(bounded.Frontends).Selected);
        Assert.Contains(bounded.Reasons, reason => reason.Contains("deferred by --fast"));
        Assert.Contains(bounded.Reasons, reason => reason.Contains("frontend: exhaustive runtime closure"));
    }

    [Fact]
    public void Fast_feedback_preserves_mapped_proofs_inside_an_exhaustive_fallback()
    {
        var impact = new GateImpactPlan(
            new BackendImpact(
                true,
                new HashSet<string> { "LoginProof" },
                new HashSet<string> { "Account/Login" }),
            [],
            ["backend contract changed"]);

        var bounded = GateCommand.ApplyFastFeedback(impact, fast: true);

        Assert.False(bounded.Backend.Full);
        Assert.Contains("LoginProof", bounded.Backend.Filters);
        Assert.Contains("Account/Login", bounded.Backend.AffectedSlices);
    }

    [Fact]
    public void Fast_feedback_preserves_mapped_frontend_proofs_inside_an_exhaustive_fallback()
    {
        var frontend = new FrontendImpact(new FrontendPackage("clients/web", FrontendPackageRole.Surface))
        {
            Full = true,
        };
        frontend.Tests.Add("src/features/login/Login.test.ts");
        frontend.Assays.Add("src/features/login/Login.assay.test.ts");
        frontend.Flows.Add(new FrontendFlow(
            "login-happy",
            "web",
            "e2e/login.spec.ts",
            ["Login"],
            ["Login"]));
        var impact = new GateImpactPlan(
            new BackendImpact(false, new HashSet<string>(), new HashSet<string>()),
            [frontend],
            ["generated client changed"]);

        var bounded = GateCommand.ApplyFastFeedback(impact, fast: true);

        var selected = Assert.Single(bounded.Frontends);
        Assert.False(selected.Full);
        Assert.Contains("src/features/login/Login.test.ts", selected.Tests);
        Assert.Contains("src/features/login/Login.assay.test.ts", selected.Assays);
        Assert.Equal("login-happy", Assert.Single(selected.Flows).Id);
    }

    [Fact]
    public void Fast_feedback_keeps_every_mapped_backend_proof_selected()
    {
        var impact = new GateImpactPlan(
            new BackendImpact(
                false,
                new HashSet<string> { "LoginProof" },
                new HashSet<string> { "Account/Login" }),
            [],
            []);

        var bounded = GateCommand.ApplyFastFeedback(impact, fast: true);

        Assert.True(bounded.Backend.RunsTests);
        Assert.Contains("LoginProof", bounded.Backend.Filters);
    }

    [Fact]
    public void Fast_feedback_defers_an_oversized_mapped_backend_closure()
    {
        var filters = Enumerable.Range(0, 200)
            .Select(index => $"App.Tests.Modules.Feature{index:D3}.A_very_descriptive_proof_class")
            .ToHashSet();
        var impact = new GateImpactPlan(
            new BackendImpact(false, filters, new HashSet<string> { "Feature/Change" }),
            [],
            []);

        var bounded = GateCommand.ApplyFastFeedback(impact, fast: true);

        Assert.False(bounded.Backend.RunsTests);
        Assert.Empty(bounded.Backend.AffectedSlices);
        Assert.Contains(bounded.Reasons, reason => reason.Contains("oversized mapped proof closure"));
    }

    [Fact]
    public void An_oversized_filter_fails_closed_to_the_complete_backend_suite()
    {
        var filters = Enumerable.Range(0, 200)
            .Select(index => $"App.Tests.Modules.Feature{index:D3}.A_very_descriptive_proof_class")
            .ToHashSet();
        var impact = new BackendImpact(false, filters, new HashSet<string> { "Feature/Change" });

        var arguments = GateCommand.ProofArguments(["App.slnx"], 0, "evidence", impact);

        Assert.DoesNotContain("--filter", arguments);
    }

    [Theory]
    [InlineData((int)GateMode.Affected, false)]
    [InlineData((int)GateMode.Staged, false)]
    [InlineData((int)GateMode.Full, true)]
    public void Only_an_explicit_full_audit_replaces_the_canonical_artifacts(int mode, bool expected)
    {
        Assert.Equal(expected, GateCommand.PersistsArtifacts((GateMode)mode));
    }
}
