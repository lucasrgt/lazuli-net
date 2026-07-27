using System.Runtime.InteropServices;
using AeroFortress.Framework.Cli;

namespace AeroFortress.Framework.Cli.Tests;

public class FoundationToolTests
{
    [Fact]
    public void The_framework_pins_every_native_foundation_release()
    {
        Assert.Equal("1.1.0", NyaCommand.Version);
        Assert.Equal("0.1.2", WtwCommand.Version);
        Assert.Equal("0.1.3", RtwCommand.Version);
        Assert.Equal("0.3.0", NwcCommand.Version);
    }

    [Theory]
    [InlineData("windows", Architecture.X64, "x86_64-pc-windows-msvc")]
    [InlineData("linux", Architecture.X64, "x86_64-unknown-linux-gnu")]
    [InlineData("linux", Architecture.Arm64, "aarch64-unknown-linux-gnu")]
    [InlineData("macos", Architecture.X64, "x86_64-apple-darwin")]
    [InlineData("macos", Architecture.Arm64, "aarch64-apple-darwin")]
    public void Every_foundation_resolves_every_published_platform(
        string platform,
        Architecture architecture,
        string expected)
    {
        Assert.Equal(expected, NyaCommand.Target(platform, architecture));
        Assert.Equal(expected, WtwCommand.Target(platform, architecture));
        Assert.Equal(expected, RtwCommand.Target(platform, architecture));
        Assert.Equal(expected, NwcCommand.Target(platform, architecture));
    }

    [Fact]
    public void Every_foundation_fails_closed_on_unpublished_platforms_and_unknown_assets()
    {
        Assert.Throws<PlatformNotSupportedException>(
            () => RtwCommand.Target("windows", Architecture.Arm64));
        Assert.Throws<PlatformNotSupportedException>(
            () => NwcCommand.Target("freebsd", Architecture.X64));
        Assert.Throws<PlatformNotSupportedException>(
            () => WtwCommand.Target("windows", Architecture.Arm64));

        var archive = "not a published archive"u8.ToArray();
        Assert.False(RtwCommand.ChecksumMatches(archive, "x86_64-pc-windows-msvc"));
        Assert.False(WtwCommand.ChecksumMatches(archive, "unknown-target"));
        Assert.False(NwcCommand.ChecksumMatches(archive, "unknown-target"));
    }

    [Fact]
    public void Init_adaptation_keeps_all_agent_commands_on_framework_pinned_wrappers()
    {
        var root = NewDir();
        Directory.CreateDirectory(Path.Combine(root, ".rtw"));
        Directory.CreateDirectory(Path.Combine(root, ".nwc"));
        Directory.CreateDirectory(Path.Combine(root, ".agent-first", "wtw"));
        Directory.CreateDirectory(Path.Combine(root, ".rtw", "ways"));
        Directory.CreateDirectory(Path.Combine(root, ".nwc", "deferments"));
        Directory.CreateDirectory(Path.Combine(root, ".agent-first", "wtw", "records", "decisions"));
        Directory.CreateDirectory(Path.Combine(root, ".agent-first", "wtw", "records", "invariants"));
        File.WriteAllText(
            Path.Combine(root, ".rtw", "SKILL.md"),
            "Run `rtw guide`, `rtw add`, and `rtw check`.");
        File.WriteAllText(
            Path.Combine(root, ".nwc", "SKILL.md"),
            "Run `nwc wake`, `nwc resolve`, `nwc collect`, and `nwc check`.");
        File.WriteAllText(
            Path.Combine(root, ".agent-first", "wtw", "SKILL.md"),
            "Run `wtw explain`, `wtw collect`, and `wtw guard`.");
        File.WriteAllText(
            Path.Combine(root, "AGENTS.md"),
            "Run `wtw explain`, `rtw guide`, and `nwc wake`.");

        WtwCommand.AdaptProjectInstructions(root);
        RtwCommand.AdaptProjectInstructions(root);
        NwcCommand.AdaptProjectInstructions(root);

        Assert.Contains(
            "`dotnet tool run af wtw explain`",
            File.ReadAllText(Path.Combine(root, ".agent-first", "wtw", "SKILL.md")));
        Assert.Contains(
            "`dotnet tool run af wtw explain`",
            File.ReadAllText(Path.Combine(root, "AGENTS.md")));
        Assert.Contains(
            "`dotnet tool run af rtw guide`",
            File.ReadAllText(Path.Combine(root, ".rtw", "SKILL.md")));
        Assert.Contains(
            "`dotnet tool run af rtw guide`",
            File.ReadAllText(Path.Combine(root, "AGENTS.md")));
        Assert.Contains(
            "`dotnet tool run af nwc collect`",
            File.ReadAllText(Path.Combine(root, ".nwc", "SKILL.md")));
        Assert.Contains(
            "`dotnet tool run af nwc wake`",
            File.ReadAllText(Path.Combine(root, "AGENTS.md")));
        Assert.True(File.Exists(Path.Combine(root, ".rtw", "ways", ".gitkeep")));
        Assert.True(File.Exists(Path.Combine(root, ".nwc", "deferments", ".gitkeep")));
        Assert.True(File.Exists(Path.Combine(
            root, ".agent-first", "wtw", "records", "decisions", ".gitkeep")));
        Assert.True(File.Exists(Path.Combine(
            root, ".agent-first", "wtw", "records", "invariants", ".gitkeep")));
    }

    private static string NewDir()
    {
        var path = Path.Combine(
            Path.GetTempPath(),
            "aerofortress-foundations-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }
}
