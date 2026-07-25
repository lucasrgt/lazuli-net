using System.Runtime.InteropServices;
using System.Security.Cryptography;
using AeroFortress.Framework.Cli;

namespace AeroFortress.Framework.Cli.Tests;

public class NyaCommandTests
{
    [Theory]
    [InlineData("windows", Architecture.X64, "x86_64-pc-windows-msvc")]
    [InlineData("linux", Architecture.X64, "x86_64-unknown-linux-gnu")]
    [InlineData("linux", Architecture.Arm64, "aarch64-unknown-linux-gnu")]
    [InlineData("macos", Architecture.X64, "x86_64-apple-darwin")]
    [InlineData("macos", Architecture.Arm64, "aarch64-apple-darwin")]
    public void Every_published_platform_resolves_to_its_release_target(
        string platform,
        Architecture architecture,
        string expected)
    {
        Assert.Equal(expected, NyaCommand.Target(platform, architecture));
    }

    [Fact]
    public void An_unpublished_platform_fails_instead_of_downloading_the_wrong_binary()
    {
        Assert.Throws<PlatformNotSupportedException>(() => NyaCommand.Target("windows", Architecture.Arm64));
    }

    [Fact]
    public void The_embedded_release_checksum_accepts_only_the_pinned_asset()
    {
        var archive = "not the published archive"u8.ToArray();

        Assert.False(NyaCommand.ChecksumMatches(archive, "x86_64-pc-windows-msvc"));
        Assert.False(NyaCommand.ChecksumMatches(SHA256.HashData(archive), "unknown-target"));
    }

    [Fact]
    public void Init_adaptation_keeps_agent_commands_on_the_framework_pinned_wrapper()
    {
        var root = NewDir();
        Directory.CreateDirectory(Path.Combine(root, ".nya"));
        File.WriteAllText(Path.Combine(root, ".nya", "SKILL.md"), "Run `nya recall`, then `nya check`.");
        File.WriteAllText(Path.Combine(root, "AGENTS.md"),
            "<!-- nya:instructions:start -->\nRun `nya check`.\n<!-- nya:instructions:end -->");

        NyaCommand.AdaptProjectInstructions(root);

        Assert.Contains("`dotnet tool run af nya recall`", File.ReadAllText(Path.Combine(root, ".nya", "SKILL.md")));
        Assert.Contains("`dotnet tool run af nya check`", File.ReadAllText(Path.Combine(root, "AGENTS.md")));
    }

    [Fact]
    public void Project_validation_requires_the_versioned_store_and_agent_protocol()
    {
        var root = NewDir();

        var missing = NyaProject.Check(root);

        Assert.False(missing.Valid);
        Assert.Contains(missing.Messages, message => message.Contains(".nya/config.toml"));
        Assert.Contains(missing.Messages, message => message.Contains("agent instructions"));

        Directory.CreateDirectory(Path.Combine(root, ".nya", "scars"));
        File.WriteAllText(Path.Combine(root, ".nya", "config.toml"), "schema = 1");
        File.WriteAllText(Path.Combine(root, ".nya", "SKILL.md"), "Run `dotnet tool run af nya recall`.");
        File.WriteAllText(Path.Combine(root, "AGENTS.md"),
            "<!-- nya:instructions:start -->\nRun `dotnet tool run af nya check`.\n<!-- nya:instructions:end -->");

        var configured = NyaProject.Check(root);

        Assert.True(configured.Valid);
        Assert.Empty(configured.Messages);
    }

    private static string NewDir()
    {
        var path = Path.Combine(Path.GetTempPath(), "aerofortress-nya-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }
}
