using Skies.Framework.Cli;
using System.Runtime.CompilerServices;

namespace Skies.Framework.Cli.Tests;

public class FoundationProjectTests
{
    [Fact]
    public void Right_this_way_requires_its_versioned_store_skill_and_agent_protocol()
    {
        var root = NewDir();
        var missing = RtwProject.Check(root);

        Assert.False(missing.Valid);
        Assert.Contains(missing.Messages, message => message.Contains(".rtw/SKILL.md"));
        Assert.Contains(missing.Messages, message => message.Contains(".rtw/ways"));

        Directory.CreateDirectory(Path.Combine(root, ".rtw", "ways"));
        File.WriteAllText(
            Path.Combine(root, ".rtw", "SKILL.md"),
            """
            Run `dotnet tool run skies rtw guide`.
            Run `dotnet tool run skies rtw add`.
            Run `dotnet tool run skies rtw check`.
            """);
        File.WriteAllText(
            Path.Combine(root, "AGENTS.md"),
            FoundationInstructions.Block);

        Assert.True(RtwProject.Check(root).Valid);
    }

    [Fact]
    public void Now_we_can_requires_its_versioned_store_skill_and_agent_protocol()
    {
        var root = NewDir();
        var missing = NwcProject.Check(root);

        Assert.False(missing.Valid);
        Assert.Contains(missing.Messages, message => message.Contains(".nwc/SKILL.md"));
        Assert.Contains(missing.Messages, message => message.Contains(".nwc/deferments"));

        Directory.CreateDirectory(Path.Combine(root, ".nwc", "deferments"));
        File.WriteAllText(
            Path.Combine(root, ".nwc", "SKILL.md"),
            """
            Run `dotnet tool run skies nwc wake`.
            Run `dotnet tool run skies nwc resolve`.
            Run `dotnet tool run skies nwc collect`.
            Run `dotnet tool run skies nwc check`.
            """);
        File.WriteAllText(
            Path.Combine(root, "CLAUDE.md"),
            FoundationInstructions.Block);

        Assert.True(NwcProject.Check(root).Valid);
    }

    [Fact]
    public void Why_this_way_requires_both_record_stores_skill_and_agent_protocol()
    {
        var root = NewDir();
        var missing = WtwProject.Check(root);

        Assert.False(missing.Valid);
        Assert.Contains(missing.Messages, message => message.Contains(".wtw/SKILL.md"));
        Assert.Contains(missing.Messages, message => message.Contains("records/decisions"));
        Assert.Contains(missing.Messages, message => message.Contains("records/invariants"));

        Directory.CreateDirectory(Path.Combine(
            root, ".wtw", "records", "decisions"));
        Directory.CreateDirectory(Path.Combine(
            root, ".wtw", "records", "invariants"));
        File.WriteAllText(
            Path.Combine(root, ".wtw", "SKILL.md"),
            """
            Run `dotnet tool run skies wtw explain`.
            Run `dotnet tool run skies wtw collect`.
            Run `dotnet tool run skies wtw guard`.
            """);
        File.WriteAllText(
            Path.Combine(root, "AGENTS.md"),
            FoundationInstructions.Block);

        Assert.True(WtwProject.Check(root).Valid);
    }

    [Fact]
    public void An_outdated_skill_fails_even_when_store_and_agent_marker_exist()
    {
        var root = NewDir();
        Directory.CreateDirectory(Path.Combine(root, ".rtw", "ways"));
        File.WriteAllText(
            Path.Combine(root, ".rtw", "SKILL.md"),
            "Run `dotnet tool run skies rtw guide`.");
        File.WriteAllText(
            Path.Combine(root, "AGENTS.md"),
            FoundationInstructions.Block);

        var outcome = RtwProject.Check(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("rtw add"));
        Assert.Contains(outcome.Messages, message => message.Contains("rtw check"));
    }

    [Fact]
    public void The_application_template_carries_every_versioned_foundation_protocol()
    {
        var template = Path.Combine(RepoRoot(), "templates", "skies-app");

        Assert.True(NyaProject.Check(template).Valid);
        Assert.True(WtwProject.Check(template).Valid);
        Assert.True(RtwProject.Check(template).Valid);
        Assert.True(NwcProject.Check(template).Valid);
    }

    [Fact]
    public void The_template_liveness_slice_remains_read_only_and_owes_no_write_journeys()
    {
        var ping = File.ReadAllText(Path.Combine(
            RepoRoot(),
            "templates",
            "skies-app",
            "src",
            "Skies.Framework.Starter.Api",
            "Modules",
            "Health",
            "Slices",
            "Ping.cs"));

        Assert.Contains("MapGet", ping);
        Assert.DoesNotContain("MapPost", ping);
    }

    [Fact]
    public void Framework_source_hooks_serialize_cli_builds()
    {
        var hooks = File.ReadAllText(Path.Combine(RepoRoot(), "lefthook.yml"));

        Assert.Contains("dotnet run --project src/Skies.Framework.Cli", hooks);
        Assert.DoesNotContain("parallel: true", hooks);
    }

    private static string NewDir()
    {
        var path = Path.Combine(
            Path.GetTempPath(),
            "skies-foundation-project-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }

    private static string RepoRoot([CallerFilePath] string thisFile = "") =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(thisFile)!, "..", ".."));
}
