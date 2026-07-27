using AeroFortress.Framework.Cli;
using System.Runtime.CompilerServices;

namespace AeroFortress.Framework.Cli.Tests;

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
            Run `dotnet tool run af rtw guide`.
            Run `dotnet tool run af rtw add`.
            Run `dotnet tool run af rtw check`.
            """);
        File.WriteAllText(
            Path.Combine(root, "AGENTS.md"),
            "<!-- rtw:instructions:start -->\nRun `dotnet tool run af rtw guide`.\n"
            + "<!-- rtw:instructions:end -->");

        Assert.True(RtwProject.Check(root).Valid);
    }

    [Fact]
    public void Wake_me_when_requires_its_versioned_store_skill_and_agent_protocol()
    {
        var root = NewDir();
        var missing = WmwProject.Check(root);

        Assert.False(missing.Valid);
        Assert.Contains(missing.Messages, message => message.Contains(".wmw/SKILL.md"));
        Assert.Contains(missing.Messages, message => message.Contains(".wmw/deferments"));

        Directory.CreateDirectory(Path.Combine(root, ".wmw", "deferments"));
        File.WriteAllText(
            Path.Combine(root, ".wmw", "SKILL.md"),
            """
            Run `dotnet tool run af wmw wake`.
            Run `dotnet tool run af wmw resolve`.
            Run `dotnet tool run af wmw collect`.
            Run `dotnet tool run af wmw check`.
            """);
        File.WriteAllText(
            Path.Combine(root, "CLAUDE.md"),
            "<!-- wmw:instructions:start -->\nRun `dotnet tool run af wmw wake`.\n"
            + "<!-- wmw:instructions:end -->");

        Assert.True(WmwProject.Check(root).Valid);
    }

    [Fact]
    public void An_outdated_skill_fails_even_when_store_and_agent_marker_exist()
    {
        var root = NewDir();
        Directory.CreateDirectory(Path.Combine(root, ".rtw", "ways"));
        File.WriteAllText(
            Path.Combine(root, ".rtw", "SKILL.md"),
            "Run `dotnet tool run af rtw guide`.");
        File.WriteAllText(
            Path.Combine(root, "AGENTS.md"),
            "<!-- rtw:instructions:start -->\nRun `dotnet tool run af rtw guide`.\n"
            + "<!-- rtw:instructions:end -->");

        var outcome = RtwProject.Check(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("rtw add"));
        Assert.Contains(outcome.Messages, message => message.Contains("rtw check"));
    }

    [Fact]
    public void The_application_template_carries_every_versioned_foundation_protocol()
    {
        var template = Path.Combine(RepoRoot(), "templates", "aerofortress-app");

        Assert.True(NyaProject.Check(template).Valid);
        Assert.True(RtwProject.Check(template).Valid);
        Assert.True(WmwProject.Check(template).Valid);
    }

    [Fact]
    public void The_template_liveness_slice_remains_read_only_and_owes_no_write_journeys()
    {
        var ping = File.ReadAllText(Path.Combine(
            RepoRoot(),
            "templates",
            "aerofortress-app",
            "src",
            "AeroFortress.Framework.Starter.Api",
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

        Assert.Contains("dotnet run --project src/AeroFortress.Framework.Cli", hooks);
        Assert.DoesNotContain("parallel: true", hooks);
    }

    private static string NewDir()
    {
        var path = Path.Combine(
            Path.GetTempPath(),
            "aerofortress-foundation-project-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }

    private static string RepoRoot([CallerFilePath] string thisFile = "") =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(thisFile)!, "..", ".."));
}
