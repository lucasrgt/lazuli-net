using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;
using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class FrameworkSyncTests
{
    [Fact]
    public void An_app_with_no_skies_references_is_in_sync()
    {
        var app = NewApp();

        var outcome = FrameworkSync.Check(app);

        Assert.True(outcome.Gating);
        Assert.True(outcome.InSync);
        Assert.Empty(outcome.Messages);
    }

    [Fact]
    public void A_stale_backend_version_fails_without_any_framework_checkout()
    {
        var app = NewApp();
        WriteCsproj(app, "Shop.Api.csproj", "Skies.Framework", StaleVersion);

        var outcome = FrameworkSync.Check(app);

        Assert.True(outcome.Gating);
        Assert.False(outcome.InSync);
        Assert.Contains(outcome.Messages,
            m => m.Contains(StaleVersion) && m.Contains(FrameworkPackageVersions.Framework));
    }

    [Fact]
    public void The_version_this_doctor_ships_for_passes()
    {
        var app = NewApp();
        WriteCsproj(app, "Shop.Api.csproj",
            "Skies.Framework.EntityFrameworkCore", FrameworkPackageVersions.Framework);

        var outcome = FrameworkSync.Check(app);

        Assert.True(outcome.InSync);
    }

    [Fact]
    public void A_stale_assay_host_fails_even_when_framework_packages_are_current()
    {
        var app = NewApp();
        WriteCsproj(app, "Shop.Tests.csproj", "Assay.Net", StaleVersion);

        var outcome = FrameworkSync.Check(app);

        Assert.False(outcome.InSync);
        Assert.Contains(outcome.Messages,
            message => message.Contains("Assay.Net") && message.Contains(FrameworkPackageVersions.Assay));
    }

    [Fact]
    public void The_required_assay_host_passes()
    {
        var app = NewApp();
        WriteCsproj(app, "Shop.Tests.csproj", "Assay.Net", FrameworkPackageVersions.Assay);

        Assert.True(FrameworkSync.Check(app).InSync);
    }

    [Fact]
    public void A_retired_plugin_copy_fails_even_without_a_frontend()
    {
        var app = NewApp();
        Directory.CreateDirectory(Path.Combine(app, "clients", "eslint-plugin-skies"));

        var outcome = FrameworkSync.Check(app);

        Assert.False(outcome.InSync);
        Assert.Contains(outcome.Messages, m => m.Contains("retired vendored"));
    }

    // The SSOT safety net: the version baked into the CLI (what scaffolds stamp and the gate enforces) must equal
    // the library props <Version> the packages are actually built with, so the two copies can never drift apart.
    [Fact]
    public void Baked_framework_version_matches_the_props_ssot()
    {
        var version = Regex.Match(File.ReadAllText(PropsPath()), @"<Version>([^<]+)</Version>");

        Assert.True(version.Success, "could not read <Version> from Skies.Framework.Library.props");
        Assert.Equal(FrameworkPackageVersions.Framework, version.Groups[1].Value);
    }

    // The scaffold starter ships literal package versions (the generators stamp the constant, but `skies new`'s
    // csproj is static), so a test pins them to the SSOT — a freshly-scaffolded app is never born on a historical
    // framework version (the "nasce velho" drift).
    [Fact]
    public void Template_package_references_match_the_shipped_version()
    {
        var refs = Directory
            .EnumerateFiles(Path.Combine(RepoRoot(), "templates"), "*.csproj", SearchOption.AllDirectories)
            .SelectMany(p => Regex.Matches(File.ReadAllText(p), @"Include=""(Skies[^""]*)""\s+Version=""([^""]+)""")
                .Select(m => (Package: m.Groups[1].Value, Version: m.Groups[2].Value)))
            .ToList();

        Assert.NotEmpty(refs);
        Assert.All(refs, reference => Assert.Equal(FrameworkPackageVersions.Framework, reference.Version));
    }

    [Fact]
    public void Template_assay_reference_matches_the_protocol_host()
    {
        var refs = Directory
            .EnumerateFiles(Path.Combine(RepoRoot(), "templates"), "*.csproj", SearchOption.AllDirectories)
            .SelectMany(path => Regex.Matches(File.ReadAllText(path), @"Include=""Assay\.Net""\s+Version=""([^""]+)""")
                .Select(match => match.Groups[1].Value))
            .ToList();

        Assert.NotEmpty(refs);
        Assert.All(refs, version => Assert.Equal(FrameworkPackageVersions.Assay, version));
    }

    private const string StaleVersion = "0.0.1-stale";

    private static string NewApp() => Directory.CreateTempSubdirectory("skies-sync-test").FullName;

    private static void WriteCsproj(string app, string file, string package, string version) =>
        File.WriteAllText(Path.Combine(app, file),
            $"""<Project><ItemGroup><PackageReference Include="{package}" Version="{version}" /></ItemGroup></Project>""");

    // The repo root, resolved from this test's source location so file assertions hold both locally and on CI
    // (the checkout path is embedded at compile time and exists at test time). tests/<proj>/<file> → up two.
    private static string RepoRoot([CallerFilePath] string thisFile = "") =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(thisFile)!, "..", ".."));

    // The library props is the version SSOT.
    private static string PropsPath() => Path.Combine(RepoRoot(), "build", "Skies.Framework.Library.props");
}
