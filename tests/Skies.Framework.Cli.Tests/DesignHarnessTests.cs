namespace Skies.Framework.Cli.Tests;

public sealed class DesignHarnessTests
{
    [Fact]
    public void Design_harness_is_configured_only_when_contract_and_explicit_script_exist()
    {
        var root = Directory.CreateTempSubdirectory("skies-design-harness-").FullName;

        Assert.False(DesignHarness.IsConfigured(root));

        Directory.CreateDirectory(Path.Combine(root, ".design"));
        File.WriteAllText(Path.Combine(root, ".design", "contract.toml"), "schema = 1");
        Assert.False(DesignHarness.IsConfigured(root));

        File.WriteAllText(Path.Combine(root, "package.json"), "{}");
        Assert.False(DesignHarness.IsConfigured(root));

        File.WriteAllText(Path.Combine(root, "package.json"), "{\"scripts\":{\"design:doctor\":\"assay-design doctor\"}}");
        Assert.True(DesignHarness.IsConfigured(root));
    }
}
