using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class GateCommandTests
{
    [Theory]
    [InlineData("--staged")]
    [InlineData("--affected")]
    public async Task An_unavailable_git_scope_fails_before_starting_builds_or_proofs(string mode)
    {
        var root = Directory.CreateTempSubdirectory("skies-missing-scope-").FullName;
        try
        {
            var start = new System.Diagnostics.ProcessStartInfo("dotnet")
            {
                WorkingDirectory = root,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            start.ArgumentList.Add(typeof(GateCommand).Assembly.Location);
            start.ArgumentList.Add("gate");
            start.ArgumentList.Add(mode);
            using var process = System.Diagnostics.Process.Start(start)!;
            var output = process.StandardOutput.ReadToEndAsync();
            var error = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();

            Assert.Equal(2, process.ExitCode);
            Assert.Contains("no proof run started", await error);
            Assert.DoesNotContain("backend conventions", await output);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

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
        frontend.RenderedDesign = true;
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
        Assert.True(selected.RenderedDesign);
        Assert.Equal("login-happy", Assert.Single(selected.Flows).Id);
    }

    [Fact]
    public void Authoritative_feedback_promotes_an_impact_fallback_to_the_full_frontend_surface()
    {
        var frontend = new FrontendImpact(new FrontendPackage("clients/mobile", FrontendPackageRole.Surface))
        {
            ExhaustiveFallback = true,
        };
        frontend.Tests.Add("test/features/wallets/wallets_view_test.dart");
        var impact = new GateImpactPlan(
            new BackendImpact(false, new HashSet<string>(), new HashSet<string>()),
            [frontend],
            ["Flutter view has no mirrored proof"]);

        var authoritative = GateCommand.ApplyFastFeedback(impact, fast: false);

        var selected = Assert.Single(authoritative.Frontends);
        Assert.True(selected.Full);
        Assert.False(selected.ExhaustiveFallback);
        Assert.Contains("test/features/wallets/wallets_view_test.dart", selected.Tests);
    }

    [Fact]
    public void Fast_feedback_defers_an_impact_fallback_but_preserves_its_direct_frontend_proofs()
    {
        var frontend = new FrontendImpact(new FrontendPackage("clients/mobile", FrontendPackageRole.Surface))
        {
            ExhaustiveFallback = true,
        };
        frontend.Tests.Add("test/features/wallets/wallets_view_test.dart");
        var impact = new GateImpactPlan(
            new BackendImpact(false, new HashSet<string>(), new HashSet<string>()),
            [frontend],
            ["Flutter view has no mirrored proof"]);

        var bounded = GateCommand.ApplyFastFeedback(impact, fast: true);

        var selected = Assert.Single(bounded.Frontends);
        Assert.False(selected.Full);
        Assert.False(selected.ExhaustiveFallback);
        Assert.Contains("test/features/wallets/wallets_view_test.dart", selected.Tests);
        Assert.Contains(bounded.Reasons, reason => reason.Contains("deferred by --fast"));
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
    public void Fast_feedback_preserves_the_affected_closure_even_when_its_filter_is_long()
    {
        var filters = Enumerable.Range(0, 200)
            .Select(index => $"App.Tests.Modules.Feature{index:D3}.A_very_descriptive_proof_class")
            .ToHashSet();
        var impact = new GateImpactPlan(
            new BackendImpact(
                false,
                filters,
                new HashSet<string> { "Feature/Change", "Unrelated/Change" },
                new HashSet<string> { "DirectProof" },
                new HashSet<string> { "Feature/Change" }),
            [],
            []);

        var bounded = GateCommand.ApplyFastFeedback(impact, fast: true);

        Assert.True(bounded.Backend.RunsTests);
        Assert.Equal(filters, bounded.Backend.Filters);
        Assert.Equal(impact.Backend.AffectedSlices, bounded.Backend.AffectedSlices);
        Assert.DoesNotContain(bounded.Reasons, reason => reason.Contains("oversized transitive proof closure"));
    }

    [Fact]
    public void An_oversized_filter_is_preserved_in_one_runner_settings_file()
    {
        var filters = Enumerable.Range(0, 200)
            .Select(index => $"App.Tests.Modules.Feature{index:D3}.A_very_descriptive_proof_class")
            .ToHashSet();
        var impact = new BackendImpact(false, filters, new HashSet<string> { "Feature/Change" });

        var directory = Directory.CreateTempSubdirectory("skies-filter-").FullName;
        try
        {
            var arguments = GateCommand.ProofArguments(["App.slnx"], 0, directory, impact);
            var settingsPath = arguments[Array.IndexOf(arguments, "--settings") + 1];
            var settings = System.Xml.Linq.XDocument.Load(settingsPath);
            var filter = settings.Root!.Element("RunConfiguration")!.Element("TestCaseFilter")!.Value;

            Assert.Equal(filters.Count, filter.Split('|').Length);
            Assert.All(filters, term => Assert.Contains("FullyQualifiedName~" + term, filter));
            Assert.DoesNotContain("--filter", arguments);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Theory]
    [InlineData((int)GateMode.Affected, false)]
    [InlineData((int)GateMode.Staged, false)]
    [InlineData((int)GateMode.Full, true)]
    public void Only_an_explicit_full_audit_replaces_the_canonical_artifacts(int mode, bool expected)
    {
        Assert.Equal(expected, GateCommand.PersistsArtifacts((GateMode)mode));
    }

    // A surface package's E2E leg reports the contract check under --fast while no flow is ever driven. Left unsaid,
    // a branch collects commits behind green hooks while its E2E closure is red — so the omission is named.
    [Fact]
    public void A_fast_run_names_the_browser_closure_it_did_not_drive()
    {
        var options = new GateOptions(GateMode.Staged, Fast: true, BaseRevision: null, ToolArguments: []);
        var impact = new GateImpactPlan(
            new BackendImpact(false, new HashSet<string> { "LoginProof" }, new HashSet<string> { "Account/Login" }),
            [],
            []);
        var frontend = new[]
        {
            new FrontendGateLeg("web", FrontendPackageRole.Surface, 0, 0, 0, E2eShape: 0, E2e: null, "affected-fast"),
        };

        var deferred = GateCommand.DeferredCoverage(options, effectiveFull: false, impact, frontend);

        Assert.Contains(deferred, notice => notice.Contains("E2E execution", StringComparison.Ordinal));
        Assert.Contains(deferred, notice => notice.Contains("--full", StringComparison.Ordinal));
    }

    [Fact]
    public void A_fast_run_restates_every_closure_it_deferred()
    {
        var options = new GateOptions(GateMode.Affected, Fast: true, BaseRevision: null, ToolArguments: []);
        var impact = GateCommand.ApplyFastFeedback(
            new GateImpactPlan(
                new BackendImpact(true, new HashSet<string>(), new HashSet<string>()),
                [],
                ["backend contract changed"]),
            fast: true);

        var deferred = GateCommand.DeferredCoverage(options, effectiveFull: false, impact, []);

        Assert.Contains(deferred, notice => notice.Contains("exhaustive fallback", StringComparison.Ordinal));
        // The selection reason is restated as an omission, so the marker that classified it does not leak into the
        // closing notice as if --fast were still a pending action.
        Assert.DoesNotContain(deferred, notice => notice.Contains(GateCommand.FastDeferralMarker, StringComparison.Ordinal));
    }

    [Fact]
    public void A_change_scoped_run_says_it_proved_the_change_and_not_the_suite()
    {
        var options = new GateOptions(GateMode.Affected, Fast: false, BaseRevision: null, ToolArguments: []);
        var impact = new GateImpactPlan(
            new BackendImpact(false, new HashSet<string>(), new HashSet<string>()),
            [],
            []);

        var deferred = GateCommand.DeferredCoverage(options, effectiveFull: false, impact, []);

        Assert.Contains(deferred, notice => notice.Contains("outside the affected closure", StringComparison.Ordinal));
    }

    [Fact]
    public void An_exhaustive_audit_has_nothing_left_to_disclose()
    {
        var options = new GateOptions(GateMode.Full, Fast: false, BaseRevision: null, ToolArguments: []);
        var impact = new GateImpactPlan(
            new BackendImpact(true, new HashSet<string>(), new HashSet<string>()),
            [],
            []);

        Assert.Empty(GateCommand.DeferredCoverage(options, effectiveFull: true, impact, []));
    }
}
