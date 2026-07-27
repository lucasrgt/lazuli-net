using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class DoctorCommandTests
{
    [Fact]
    public void Only_manifest_declared_frontend_packages_are_gated()
    {
        var root = Path.Combine(Path.GetTempPath(), "skies-doctor-clients-" + Guid.NewGuid().ToString("N"));
        var web = Path.Combine(root, "clients", "web");
        var nonPackage = Path.Combine(root, "clients", "notes");
        Directory.CreateDirectory(web);
        Directory.CreateDirectory(nonPackage);
        File.WriteAllText(Path.Combine(web, "package.json"), "{}");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "App"

            [products.app]
            frontend = "clients/web"
            """);

        try
        {
            var client = Assert.Single(DoctorCommand.FrontendClients(root));
            Assert.Equal(web, client);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void A_clients_directory_is_not_a_topology_fallback()
    {
        var root = Path.Combine(Path.GetTempPath(), "skies-doctor-harness-" + Guid.NewGuid().ToString("N"));
        var app = Path.Combine(root, "apps", "web");
        Directory.CreateDirectory(app);
        File.WriteAllText(Path.Combine(app, "package.json"), "{}");

        try
        {
            Assert.Empty(DoctorCommand.FrontendClients(root));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void A_nested_product_core_resolves_to_its_owning_package()
    {
        var root = Path.Combine(Path.GetTempPath(), "skies-doctor-core-" + Guid.NewGuid().ToString("N"));
        var package = Path.Combine(root, "clients", "app");
        Directory.CreateDirectory(Path.Combine(package, "core"));
        File.WriteAllText(Path.Combine(package, "package.json"), "{}");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "App"

            [products.app]
            core = "clients/app/core"
            """);

        try
        {
            Assert.Equal(package, Assert.Single(DoctorCommand.FrontendClients(root)));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void Product_cores_and_surfaces_retain_their_distinct_gate_depth()
    {
        var root = Path.Combine(Path.GetTempPath(), "skies-doctor-roles-" + Guid.NewGuid().ToString("N"));
        var core = Path.Combine(root, "clients", "core");
        var web = Path.Combine(root, "clients", "web");
        Directory.CreateDirectory(core);
        Directory.CreateDirectory(web);
        File.WriteAllText(Path.Combine(core, "package.json"), "{}");
        File.WriteAllText(Path.Combine(web, "package.json"), "{}");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "App"

            [products.app]
            core = "clients/core"
            frontend = "clients/web"
            """);

        try
        {
            var targets = DoctorCommand.FrontendTargets(root);

            Assert.Contains(targets, target => target.Path == core && target.Role == FrontendPackageRole.Core);
            Assert.Contains(targets, target => target.Path == web && target.Role == FrontendPackageRole.Surface);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void Product_websites_are_executable_surfaces_not_validation_only_metadata()
    {
        var root = Path.Combine(Path.GetTempPath(), "skies-doctor-website-" + Guid.NewGuid().ToString("N"));
        var website = Path.Combine(root, "clients", "website");
        Directory.CreateDirectory(website);
        File.WriteAllText(Path.Combine(website, "package.json"), "{}");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "App"

            [products.app]
            website = "clients/website"
            """);

        try
        {
            var target = Assert.Single(DoctorCommand.FrontendTargets(root));

            Assert.Equal(website, target.Path);
            Assert.Equal(FrontendPackageRole.Surface, target.Role);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void A_package_declared_as_both_core_and_frontend_owes_surface_depth_once()
    {
        var root = Path.Combine(Path.GetTempPath(), "skies-doctor-role-merge-" + Guid.NewGuid().ToString("N"));
        var app = Path.Combine(root, "clients", "app");
        Directory.CreateDirectory(app);
        File.WriteAllText(Path.Combine(app, "package.json"), "{}");
        File.WriteAllText(Path.Combine(root, "Skies.toml"), """
            [workspace]
            name = "App"

            [products.app]
            core = "clients/app"
            frontend = "clients/app"
            """);

        try
        {
            var target = Assert.Single(DoctorCommand.FrontendTargets(root));

            Assert.Equal(FrontendPackageRole.Surface, target.Role);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
