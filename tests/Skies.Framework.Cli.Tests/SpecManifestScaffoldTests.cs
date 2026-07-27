using Skies.Framework.Cli;
using Assay.Net;

namespace Skies.Framework.Cli.Tests;

public class SpecManifestScaffoldTests
{
    [Fact]
    public void Creates_a_manifest_the_doctor_and_assay_can_read()
    {
        var dir = NewDir();

        var path = SpecManifestScaffold.EnsureDeclared(dir, "Wallets", "Withdraw", ["idempotency-key-honored"]);

        var manifest = SpecManifest.Load(path);
        Assert.Equal("Wallets", manifest.Module);
        Assert.Equal(new[] { "idempotency-key-honored" }, manifest.Slices["Withdraw"]);
    }

    [Fact]
    public void Appends_a_new_slice_without_touching_the_existing_ones()
    {
        var dir = NewDir();
        SpecManifestScaffold.EnsureDeclared(dir, "Wallets", "Withdraw", ["idempotency-key-honored"]);

        var path = SpecManifestScaffold.EnsureDeclared(dir, "Wallets", "Deposit", ["no-overdraw"]);

        var manifest = SpecManifest.Load(path);
        Assert.Equal(new[] { "idempotency-key-honored" }, manifest.Slices["Withdraw"]);
        Assert.Equal(new[] { "no-overdraw" }, manifest.Slices["Deposit"]);
    }

    [Fact]
    public void Merges_new_criteria_into_an_existing_slice_without_duplicating()
    {
        var dir = NewDir();
        SpecManifestScaffold.EnsureDeclared(dir, "Wallets", "Withdraw", ["idempotency-key-honored"]);

        var path = SpecManifestScaffold.EnsureDeclared(
            dir, "Wallets", "Withdraw", ["idempotency-key-honored", "own-resource-only"]);

        var manifest = SpecManifest.Load(path);
        Assert.Equal(new[] { "idempotency-key-honored", "own-resource-only" }, manifest.Slices["Withdraw"]);
    }

    [Fact]
    public void Never_reformats_what_a_human_already_wrote()
    {
        var dir = NewDir();
        var path = Path.Combine(dir, "Wallets.spec.toml");
        File.WriteAllText(path, """
            # A hand-written note that must survive the scaffolder.
            module = "Wallets"

            # Withdraw is the money path.
            [slices.Withdraw]
            criteria = ["idempotency-key-honored"]
            """);

        SpecManifestScaffold.EnsureDeclared(dir, "Wallets", "Deposit", ["no-overdraw"]);

        var text = File.ReadAllText(path);
        Assert.Contains("# A hand-written note that must survive the scaffolder.", text);
        Assert.Contains("# Withdraw is the money path.", text);
        Assert.Equal(new[] { "no-overdraw" }, SpecManifest.Load(path).Slices["Deposit"]);
    }

    private static string NewDir() =>
        Directory.CreateTempSubdirectory("skies-spec-scaffold-test").FullName;
}
