using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public sealed class SuppressionGateTests : IDisposable
{
    private readonly string workspace = Path.Combine(
        Path.GetTempPath(),
        "skies-suppression-gate-" + Guid.NewGuid().ToString("N"));

    public SuppressionGateTests() => Directory.CreateDirectory(workspace);

    [Fact]
    public void Community_warnings_and_rules_may_keep_their_own_policy()
    {
        Write("Directory.Build.props", "<NoWarn>$(NoWarn);CS1591</NoWarn>");
        Write("src/view.tsx", "// eslint-disable-next-line react-hooks/exhaustive-deps");

        Assert.Empty(SuppressionGate.Find(workspace));
    }

    [Theory]
    [InlineData("src/Slice.cs", "#pragma warning disable SKY0026")]
    [InlineData("src/Slice.cs", "[SuppressMessage(\"Skies\", \"SKY0026\")]")]
    [InlineData("Directory.Build.props", "<WarningsNotAsErrors>SKY0026</WarningsNotAsErrors>")]
    [InlineData("Directory.Build.props", "<NoWarn>\n  $(NoWarn);\n  SKY0026\n</NoWarn>")]
    [InlineData(".editorconfig", "dotnet_diagnostic.SKY0026.severity = none")]
    [InlineData(".globalconfig", "dotnet_analyzer_diagnostic.severity = silent")]
    [InlineData(".editorconfig", "dotnet_analyzer_diagnostic.category-Skies.Framework.Convention.severity = suggestion")]
    [InlineData(".editorconfig", "generated_code = true")]
    [InlineData("src/view.tsx", "// eslint-disable-next-line skies/no-loose-endpoint")]
    public void Skies_escape_hatches_are_rejected(string path, string content)
    {
        Write(path, content);

        var finding = Assert.Single(SuppressionGate.Find(workspace));

        Assert.Equal(path, finding.Path);
        Assert.Equal(1, finding.Line);
    }

    [Fact]
    public void Disabled_SKYFE_configuration_is_rejected()
    {
        var rule = "\"skies/" + "no-loose-endpoint\": \"off\"";
        Write("eslint.config.js", $"export default {{ rules: {{ {rule} }} }};");

        Assert.Single(SuppressionGate.Find(workspace));
    }

    [Fact]
    public void Disabled_SKYFE_yaml_configuration_is_rejected()
    {
        Write(".eslintrc.yml", "rules:\n  skies/no-loose-endpoint: off");

        Assert.Single(SuppressionGate.Find(workspace));
    }

    [Theory]
    [InlineData("src/Wallet.g.cs", false)]
    [InlineData("src/Wallet.cs", true)]
    public void Framework_declarations_cannot_hide_behind_generated_code(string path, bool header)
    {
        var marker = "[" + "Slice]";
        var generated = header ? "// <auto-" + "generated/>\n" : "";
        Write(path, $"{generated}{marker}\nstatic class Wallet {{ }}");

        var finding = Assert.Single(SuppressionGate.Find(workspace));

        Assert.Contains("generated code", finding.Reason);
    }

    [Theory]
    [InlineData("node_modules/package/index.js")]
    [InlineData("src/client.gen/api.ts")]
    [InlineData("obj/generated.cs")]
    [InlineData(".skies/items/example.cs")]
    public void Generated_and_tool_owned_directories_are_outside_the_policy(string path)
    {
        Write(path, "#pragma warning disable SKY0026");

        Assert.Empty(SuppressionGate.Find(workspace));
    }

    public void Dispose()
    {
        if (Directory.Exists(workspace))
            Directory.Delete(workspace, recursive: true);
    }

    private void Write(string relativePath, string content)
    {
        var path = Path.Combine(workspace, relativePath.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
    }
}
