using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class SkiesManifestTests
{
    [Fact]
    public void A_missing_manifest_is_a_notice_not_a_failure()
    {
        var root = NewDir();

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Present);
        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, m => m.Contains("Skies.toml"));
    }

    [Fact]
    public void A_well_formed_manifest_whose_paths_exist_is_valid()
    {
        var root = NewDir();
        var backend = Path.Combine(root, "src", "MyApp.Api");
        Directory.CreateDirectory(backend);
        WriteLaunchSettings(backend, environment: "Development", applicationUrl: "http://localhost:8080");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"

            [products.app]
            backend = "src/MyApp.Api"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.True(outcome.Present);
        Assert.True(outcome.Valid);
        Assert.Empty(outcome.Messages);
    }

    [Fact]
    public void A_backend_without_launchSettings_is_reported()
    {
        // The pilot bug: no launchSettings → a dev run defaults to Production on the .NET default port (port drift
        // + rate limiting → 429). The doctor must catch the missing file, not the runtime.
        var root = NewDir();
        Directory.CreateDirectory(Path.Combine(root, "src", "MyApp.Api"));
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"

            [products.app]
            backend = "src/MyApp.Api"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, m => m.Contains("launchSettings.json") && m.Contains("Production"));
    }

    [Fact]
    public void A_backend_launchSettings_without_Development_is_reported()
    {
        var root = NewDir();
        var backend = Path.Combine(root, "src", "MyApp.Api");
        Directory.CreateDirectory(backend);
        // Pins a port but leaves the environment unset → a dev run is still Production.
        WriteLaunchSettings(backend, environment: null, applicationUrl: "http://localhost:8080");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"

            [products.app]
            backend = "src/MyApp.Api"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, m => m.Contains("ASPNETCORE_ENVIRONMENT=Development"));
    }

    [Fact]
    public void A_core_path_needs_no_launchSettings()
    {
        // `core` is the frontend data layer, not a .NET API — the dev-env check applies only to a backend.
        var root = NewDir();
        var backend = Path.Combine(root, "src", "MyApp.Api");
        Directory.CreateDirectory(backend);
        WriteLaunchSettings(backend, environment: "Development", applicationUrl: "http://localhost:8080");
        Directory.CreateDirectory(Path.Combine(root, "clients", "core"));
        File.WriteAllText(Path.Combine(root, "clients", "package.json"), "{}");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"

            [products.app]
            backend = "src/MyApp.Api"
            core = "clients/core"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.True(outcome.Valid);
        Assert.Empty(outcome.Messages);
    }

    [Fact]
    public void A_declared_backend_path_that_does_not_exist_is_reported()
    {
        var root = NewDir();
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"

            [products.app]
            backend = "src/MyApp.Api"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.True(outcome.Present);
        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, m => m.Contains("src/MyApp.Api") && m.Contains("does not exist"));
    }

    [Fact]
    public void A_declared_frontend_must_be_an_executable_package_root()
    {
        var root = NewDir();
        Directory.CreateDirectory(Path.Combine(root, "apps", "web"));
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"

            [products.app]
            frontend = "apps/web"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, m => m.Contains("apps/web") && m.Contains("package.json"));
    }

    [Fact]
    public void Verification_has_no_manifest_mode()
    {
        var root = NewDir();
        var backend = Path.Combine(root, "src", "MyApp.Api");
        Directory.CreateDirectory(backend);
        WriteLaunchSettings(backend, environment: "Development", applicationUrl: "http://localhost:8080");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"

            [products.app]
            backend = "src/MyApp.Api"

            [proofs]
            depth = "complete"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("unsupported section [proofs]")
            && message.Contains("no configurable mode"));
    }

    [Theory]
    [InlineData("workspace", "scope", "@myapp")]
    [InlineData("products.app", "apps", "[\"web\"]")]
    [InlineData("framework", "channel", "\"preview\"")]
    public void Unknown_manifest_keys_are_rejected_in_closed_sections(string section, string key, string value)
    {
        var root = NewDir();
        File.WriteAllText(Path.Combine(root, "Skies.toml"), $$"""
            [workspace]
            name = "MyApp"

            [{{section}}]
            {{key}} = {{value}}
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains($"unsupported key '{key}'")
            && message.Contains($"[{section}]"));
    }

    [Fact]
    public void A_frontend_proof_package_omitted_from_products_is_reported()
    {
        var root = NewDir();
        var app = Path.Combine(root, "apps", "web");
        Directory.CreateDirectory(Path.Combine(app, "src", "features"));
        File.WriteAllText(Path.Combine(app, "package.json"), "{}");
        File.WriteAllText(Path.Combine(app, "src", "features", "Checkout.viewModel.ts"), "export {};");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("apps") && message.Contains("not declared"));
    }

    [Fact]
    public void A_declared_frontend_proof_package_is_valid_inventory()
    {
        var root = NewDir();
        var app = Path.Combine(root, "apps", "web");
        Directory.CreateDirectory(Path.Combine(app, "src", "features"));
        File.WriteAllText(Path.Combine(app, "package.json"), "{}");
        File.WriteAllText(Path.Combine(app, "src", "features", "Checkout.viewModel.ts"), "export {};");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"

            [products.app]
            frontend = "apps/web"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.True(outcome.Valid);
        Assert.Empty(outcome.Messages);
    }

    [Fact]
    public void A_core_path_without_an_owning_package_is_reported()
    {
        var root = NewDir();
        Directory.CreateDirectory(Path.Combine(root, "clients", "core"));
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"

            [products.app]
            core = "clients/core"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("clients/core")
            && message.Contains("owning package.json"));
    }

    [Fact]
    public void A_manifest_without_an_af_gate_workflow_is_reported()
    {
        var root = NewDir(withGateWorkflow: false);
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("skies gate") && message.Contains("workflow"));
    }

    [Fact]
    public void A_comment_that_mentions_af_gate_does_not_wire_the_workflow()
    {
        var root = NewDir(withGateWorkflow: false);
        var workflows = Path.Combine(root, ".github", "workflows");
        Directory.CreateDirectory(workflows);
        File.WriteAllText(Path.Combine(workflows, "ci.yml"), "# remember to run skies gate\n");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("skies gate") && message.Contains("workflow"));
    }

    [Theory]
    [InlineData("on: [pull_request]\njobs:\n  gate:\n    steps:\n      - run: skies gate || true\n")]
    [InlineData("on: [pull_request]\njobs:\n  gate:\n    continue-on-error: true\n    steps:\n      - run: skies gate\n")]
    [InlineData("on: [push]\njobs:\n  gate:\n    steps:\n      - run: skies gate\n")]
    public void A_gate_whose_verdict_can_be_ignored_is_not_wired(string yaml)
    {
        var root = NewDir(withGateWorkflow: false);
        var workflows = Path.Combine(root, ".github", "workflows");
        Directory.CreateDirectory(workflows);
        File.WriteAllText(Path.Combine(workflows, "ci.yml"), yaml);
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"
            """);

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("skies gate") && message.Contains("workflow"));
    }

    [Fact]
    public void A_repo_pinned_dotnet_tool_gate_is_a_direct_required_invocation()
    {
        var root = NewDir(withGateWorkflow: false);
        var workflows = Path.Combine(root, ".github", "workflows");
        Directory.CreateDirectory(workflows);
        File.WriteAllText(Path.Combine(workflows, "ci.yml"),
            "on: [pull_request, workflow_dispatch]\njobs:\n  gate:\n    steps:\n"
          + "      - run: dotnet tool run skies gate --affected --base origin/main\n"
          + "      - run: dotnet tool run skies check --task \"release\" --full\n");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), "[workspace]\nname=\"MyApp\"\n");

        var outcome = SkiesManifest.Validate(root);

        Assert.True(outcome.Valid);
    }

    [Fact]
    public void A_fast_pull_request_gate_is_not_the_authoritative_verdict()
    {
        var root = NewDir(withGateWorkflow: false);
        var workflows = Path.Combine(root, ".github", "workflows");
        Directory.CreateDirectory(workflows);
        File.WriteAllText(Path.Combine(workflows, "ci.yml"),
            "on: [pull_request, workflow_dispatch]\njobs:\n  gate:\n    steps:\n"
          + "      - run: dotnet tool run skies gate --affected --fast\n"
          + "      - run: dotnet tool run skies gate --full\n");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), "[workspace]\nname=\"MyApp\"\n");

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("without `--fast`"));
    }

    [Fact]
    public void A_full_only_pull_request_gate_does_not_replace_affected_verification()
    {
        var root = NewDir(withGateWorkflow: false);
        var workflows = Path.Combine(root, ".github", "workflows");
        Directory.CreateDirectory(workflows);
        File.WriteAllText(Path.Combine(workflows, "ci.yml"),
            "on: [pull_request, workflow_dispatch]\njobs:\n  gate:\n    steps:\n"
          + "      - run: dotnet tool run skies gate --full\n");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), "[workspace]\nname=\"MyApp\"\n");

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("affected") && message.Contains("without `--fast`"));
    }

    [Fact]
    public void A_repository_without_a_full_release_workflow_is_reported()
    {
        var root = NewDir(withGateWorkflow: false);
        var workflows = Path.Combine(root, ".github", "workflows");
        Directory.CreateDirectory(workflows);
        File.WriteAllText(
            Path.Combine(workflows, "ci.yml"),
            "on: [pull_request]\njobs:\n  gate:\n    steps:\n      - run: skies gate --affected\n");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), "[workspace]\nname=\"MyApp\"\n");

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("release") && message.Contains("--full"));
    }

    [Fact]
    public void An_npm_workspace_package_cannot_remain_outside_the_product_topology()
    {
        var root = NewDir();
        Directory.CreateDirectory(Path.Combine(root, "clients/ui"));
        File.WriteAllText(Path.Combine(root, "package.json"), "{\"workspaces\":[\"clients/*\"]}");
        File.WriteAllText(Path.Combine(root, "clients/ui/package.json"), "{}");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), "[workspace]\nname=\"MyApp\"\n");

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("clients\\ui") || message.Contains("clients/ui"));
    }

    [Fact]
    public void A_declared_library_is_gated_without_owing_its_own_e2e_runner()
    {
        var root = NewDir();
        Directory.CreateDirectory(Path.Combine(root, "clients/ui"));
        File.WriteAllText(Path.Combine(root, "package.json"), "{\"workspaces\":[\"clients/*\"]}");
        File.WriteAllText(Path.Combine(root, "clients/ui/package.json"), "{}");
        File.WriteAllText(Path.Combine(root, "Skies.toml"),
            "[workspace]\nname=\"MyApp\"\n[products.ui]\nlibrary=\"clients/ui\"\n");

        var outcome = SkiesManifest.Validate(root);
        var package = Assert.Single(SkiesManifest.FrontendPackages(root));

        Assert.True(outcome.Valid);
        Assert.Equal(FrontendPackageRole.Library, package.Role);
    }

    [Fact]
    public void Endpoint_coverage_follows_the_configured_product_topology()
    {
        var root = NewDir();
        foreach (var package in new[] { "clients/core", "clients/web", "clients/native" })
        {
            Directory.CreateDirectory(Path.Combine(root, package, "src"));
            File.WriteAllText(Path.Combine(root, package, "package.json"), "{}");
        }
        Directory.CreateDirectory(Path.Combine(root, "clients/core/src/client.gen"));
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "MyApp"

            [products.web]
            core = "clients/core"
            frontend = "clients/web"

            [products.native]
            core = "clients/core"
            frontend = "clients/native"
            """);

        var target = Assert.Single(SkiesManifest.EndpointCoverageTargets(root));

        Assert.Equal(
            Path.GetFullPath(Path.Combine(root, "clients/core/src/client.gen")),
            target.ClientPath);
        Assert.Equal(3, target.SourcePaths.Count);
        Assert.Contains(Path.GetFullPath(Path.Combine(root, "clients/core/src")), target.SourcePaths);
        Assert.Contains(Path.GetFullPath(Path.Combine(root, "clients/web/src")), target.SourcePaths);
        Assert.Contains(Path.GetFullPath(Path.Combine(root, "clients/native/src")), target.SourcePaths);
    }

    [Fact]
    public void A_manifest_without_a_workspace_section_is_reported()
    {
        var root = NewDir();
        File.WriteAllText(Path.Combine(root, "Skies.toml"), "[products.app]\nbackend = \"src\"\n");
        Directory.CreateDirectory(Path.Combine(root, "src"));

        var outcome = SkiesManifest.Validate(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, m => m.Contains("[workspace]"));
    }

    private static string NewDir(bool withGateWorkflow = true)
    {
        var dir = Path.Combine(Path.GetTempPath(), "skies-manifest-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        if (withGateWorkflow)
        {
            var workflows = Path.Combine(dir, ".github", "workflows");
            Directory.CreateDirectory(workflows);
            File.WriteAllText(
                Path.Combine(workflows, "ci.yml"),
                "on: [pull_request, workflow_dispatch]\njobs:\n  gate:\n    steps:\n"
              + "      - run: skies gate --affected\n"
              + "      - run: skies gate --full\n");
        }
        return dir;
    }

    /// <summary>Write a Properties/launchSettings.json under <paramref name="backendDir"/> with an optional
    /// environment + applicationUrl, so a manifest test can model a pinned (or unpinned) dev environment.</summary>
    private static void WriteLaunchSettings(string backendDir, string? environment, string? applicationUrl)
    {
        var properties = Path.Combine(backendDir, "Properties");
        Directory.CreateDirectory(properties);
        var env = environment is null ? "" : $"\n        \"environmentVariables\": {{ \"ASPNETCORE_ENVIRONMENT\": \"{environment}\" }},";
        var url = applicationUrl is null ? "" : $"\n        \"applicationUrl\": \"{applicationUrl}\",";
        File.WriteAllText(Path.Combine(properties, "launchSettings.json"), $$"""
            {
              "profiles": {
                "App": {
                  "commandName": "Project",{{url}}{{env}}
                  "dotnetRunMessages": true
                }
              }
            }
            """);
    }
}
