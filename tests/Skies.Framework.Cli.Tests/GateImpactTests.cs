using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public sealed class GateImpactTests
{
    [Fact]
    public void A_slice_change_selects_its_unit_avp_journey_and_linked_frontend_flow()
    {
        var root = Workspace();
        try
        {
            var package = new FrontendPackage(Path.Combine(root, "clients/web"), FrontendPackageRole.Surface);
            var plan = GateImpact.Build(
                root,
                ["src/App/Modules/Account/Slices/Login.cs"],
                [new SliceSite("Account", "Login", "src/App/Modules/Account/Slices/Login.cs")],
                [new AvpProof("Account", "Login", "valid-session", "src/App/Login.Avp.Tests.cs", "LoginProof", "Holds")],
                [new JourneyProof("Login", "src/App/AuthJourney.Tests.cs", "AuthJourney", "Signs_in")],
                [],
                [package]);

            Assert.False(plan.Backend.Full);
            Assert.Contains("Account/Login", plan.Backend.AffectedSlices);
            Assert.Contains("LoginProof", plan.Backend.Filters);
            Assert.Contains("AuthJourney", plan.Backend.Filters);
            Assert.Equal("login-happy", Assert.Single(plan.Frontends[0].Flows).Id);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void A_widened_change_keeps_the_specific_proofs_already_mapped()
    {
        var root = Workspace();
        try
        {
            var plan = GateImpact.Build(
                root,
                ["src/App/Modules/Account/Slices/Login.cs", "src/App/App.csproj"],
                [new SliceSite("Account", "Login", "src/App/Modules/Account/Slices/Login.cs")],
                [new AvpProof("Account", "Login", "valid-session", "src/App/Login.Avp.Tests.cs", "LoginProof", "Holds")],
                [new JourneyProof("Login", "src/App/AuthJourney.Tests.cs", "AuthJourney", "Signs_in")],
                [],
                []);

            Assert.True(plan.Backend.Full);
            Assert.Contains("Account/Login", plan.Backend.AffectedSlices);
            Assert.Contains("LoginProof", plan.Backend.Filters);
            Assert.Contains("AuthJourney", plan.Backend.Filters);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void A_viewmodel_change_selects_its_assay_and_semantically_linked_flow()
    {
        var root = Workspace();
        try
        {
            var package = new FrontendPackage(Path.Combine(root, "clients/web"), FrontendPackageRole.Surface);
            var plan = GateImpact.Build(
                root,
                ["clients/web/src/features/login/Login.viewModel.ts"],
                [], [], [], [], [package]);

            var frontend = Assert.Single(plan.Frontends);
            Assert.Contains("src/features/login/Login.assay.test.ts", frontend.Assays);
            Assert.Equal("login-happy", Assert.Single(frontend.Flows).Id);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void An_unmapped_backend_dependency_widens_instead_of_silently_skipping()
    {
        var root = Workspace();
        try
        {
            var plan = GateImpact.Build(
                root,
                ["src/App/Infrastructure/Clock.cs"],
                [], [], [], [], []);

            Assert.True(plan.Backend.Full);
            Assert.Contains(plan.Reasons, reason => reason.Contains("no unambiguous slice binding"));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void A_shared_backend_dependency_selects_transitive_slice_and_test_consumers()
    {
        var root = Workspace();
        try
        {
            var infrastructure = Path.Combine(root, "src/App/Infrastructure");
            var module = Path.Combine(root, "src/App/Modules/Account");
            var tests = Path.Combine(root, "tests/App.Tests");
            Directory.CreateDirectory(infrastructure);
            Directory.CreateDirectory(module);
            Directory.CreateDirectory(tests);
            File.WriteAllText(Path.Combine(infrastructure, "Clock.cs"),
                "namespace App.Infrastructure; public sealed class Clock { }");
            File.WriteAllText(Path.Combine(module, "Login.cs"),
                "using App.Infrastructure; [Slice] public static class Login { private static Clock? clock; }");
            File.WriteAllText(Path.Combine(tests, "LoginTests.cs"),
                "public sealed class LoginTests { [Fact] public void Holds() { _ = typeof(Login); } }");

            var plan = GateImpact.Build(
                root,
                ["src/App/Infrastructure/Clock.cs"],
                [new SliceSite("Account", "Login", "src/App/Modules/Account/Login.cs")],
                [],
                [],
                [new CSharpTestSite("tests/App.Tests/LoginTests.cs", "App.Tests.LoginTests")],
                []);

            Assert.False(plan.Backend.Full);
            Assert.Contains("Account/Login", plan.Backend.AffectedSlices);
            Assert.Contains("App.Tests.LoginTests", plan.Backend.Filters);
            Assert.Contains(plan.Reasons, reason => reason.Contains("transitive C# consumer"));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void An_unmapped_shared_library_change_widens_to_every_surface()
    {
        var root = Workspace();
        try
        {
            Directory.CreateDirectory(Path.Combine(root, "clients/ui/src"));
            File.WriteAllText(Path.Combine(root, "clients/ui/package.json"), "{}");
            File.WriteAllText(Path.Combine(root, "clients/ui/src/Button.tsx"), "export {};");
            var library = new FrontendPackage(Path.Combine(root, "clients/ui"), FrontendPackageRole.Core);
            var surface = new FrontendPackage(Path.Combine(root, "clients/web"), FrontendPackageRole.Surface);

            var plan = GateImpact.Build(
                root,
                ["clients/ui/src/Button.tsx"],
                [], [], [], [], [library, surface]);

            Assert.All(plan.Frontends, impact => Assert.True(impact.Full));
            Assert.Contains(plan.Reasons, reason => reason.Contains("every surface"));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Theory]
    [InlineData(".config/dotnet-tools.json")]
    [InlineData("lefthook.yml")]
    [InlineData(".github/workflows/ci.yml")]
    public void Gate_control_changes_do_not_execute_unrelated_application_proofs(string change)
    {
        var root = Workspace();
        try
        {
            var package = new FrontendPackage(Path.Combine(root, "clients/web"), FrontendPackageRole.Surface);

            var plan = GateImpact.Build(root, [change], [], [], [], [], [package]);

            Assert.False(plan.Backend.RunsTests);
            Assert.False(Assert.Single(plan.Frontends).Selected);
            Assert.Contains(plan.Reasons, reason => reason.Contains("control-only"));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Theory]
    [InlineData("Skies.toml")]
    [InlineData("global.json")]
    [InlineData("Directory.Build.props")]
    public void Runtime_wide_contract_changes_remain_fail_closed(string change)
    {
        var root = Workspace();
        try
        {
            var package = new FrontendPackage(Path.Combine(root, "clients/web"), FrontendPackageRole.Surface);

            var plan = GateImpact.Build(root, [change], [], [], [], [], [package]);

            Assert.True(plan.Backend.Full);
            Assert.True(Assert.Single(plan.Frontends).Full);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void A_cli_upgrade_beside_a_frontend_lockfile_never_impersonates_backend_impact()
    {
        var root = Workspace();
        try
        {
            var package = new FrontendPackage(Path.Combine(root, "clients/web"), FrontendPackageRole.Surface);

            var plan = GateImpact.Build(
                root,
                [".config/dotnet-tools.json", "package-lock.json"],
                [],
                [],
                [],
                [],
                [package]);

            Assert.False(plan.Backend.RunsTests);
            Assert.True(Assert.Single(plan.Frontends).Full);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static string Workspace()
    {
        var root = Directory.CreateTempSubdirectory("skies-impact-").FullName;
        Directory.CreateDirectory(Path.Combine(root, "src/App"));
        Directory.CreateDirectory(Path.Combine(root, "clients/web/src/features/login"));
        Directory.CreateDirectory(Path.Combine(root, "clients/web/e2e"));
        File.WriteAllText(Path.Combine(root, SkiesManifest.FileName),
            "[workspace]\nname=\"test\"\n[products.app]\nbackend=\"src/App\"\nfrontend=\"clients/web\"\n");
        File.WriteAllText(Path.Combine(root, "clients/web/package.json"), "{}");
        File.WriteAllText(Path.Combine(root, "clients/web/src/features/login/Login.viewModel.ts"), "export {};");
        File.WriteAllText(Path.Combine(root, "clients/web/src/features/login/Login.assay.test.ts"), "export {};");
        File.WriteAllText(Path.Combine(root, "clients/web/e2e/login.spec.ts"), "export {};");
        File.WriteAllText(Path.Combine(root, "clients/web/e2e/flows.json"),
            "[{\"id\":\"login-happy\",\"target\":\"web\",\"spec\":\"e2e/login.spec.ts\","
          + "\"features\":[\"Login\"],\"backendSlices\":[\"Login\"]}]");
        return root;
    }
}
