using Skies.Framework.Cli;
using System.Runtime.CompilerServices;

namespace Skies.Framework.Cli.Tests;

public class FoundationProjectTests
{
    [Fact]
    public void Csm_requires_shared_configuration_storage_skills_and_agent_protocol()
    {
        var root = NewDir();

        var missing = CsmProject.Check(root);

        Assert.False(missing.Valid);
        Assert.Contains(missing.Messages, message => message.Contains("csm.toml"));

        CreateCompleteProject(root);

        var configured = CsmProject.Check(root);
        Assert.True(configured.Valid);
        Assert.Empty(configured.Messages);
    }

    [Fact]
    public void Csm_honors_the_shared_storage_override()
    {
        var root = NewDir();
        CreateCompleteProject(root, ".memory/csm");

        var configured = CsmProject.Check(root);

        Assert.True(configured.Valid);
        Assert.False(Directory.Exists(Path.Combine(root, ".skies", "csm")));
    }

    [Fact]
    public void Legacy_standalone_stores_are_rejected_with_an_adoption_command()
    {
        var root = NewDir();
        CreateCompleteProject(root);
        Directory.CreateDirectory(Path.Combine(root, ".nya", "scars"));

        var outcome = CsmProject.Check(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message =>
            message.Contains(".nya") && message.Contains("foundations init"));
    }

    [Fact]
    public void Csm_adaptation_keeps_skills_on_the_skies_wrapper_and_empty_stores_versioned()
    {
        var root = NewDir();
        WriteConfig(root, ".skies/csm");
        var storage = Path.Combine(root, ".skies", "csm");
        Directory.CreateDirectory(Path.Combine(storage, "nya", "scars"));
        Directory.CreateDirectory(Path.Combine(storage, "rtw", "ways"));
        Directory.CreateDirectory(Path.Combine(storage, "wtw", "records", "decisions"));
        Directory.CreateDirectory(Path.Combine(storage, "wtw", "records", "invariants"));
        Directory.CreateDirectory(Path.Combine(storage, "nwc", "deferments"));
        File.WriteAllText(Path.Combine(storage, "nya", "SKILL.md"), "upstream NYA skill");
        File.WriteAllText(Path.Combine(storage, "rtw", "SKILL.md"), "upstream RTW skill");
        File.WriteAllText(Path.Combine(storage, "wtw", "SKILL.md"), "upstream WTW skill");
        File.WriteAllText(Path.Combine(storage, "nwc", "SKILL.md"), "upstream NWC skill");

        CsmProject.AdaptInstructions(root);

        Assert.Contains(
            "`dotnet tool run skies nya recall`",
            File.ReadAllText(Path.Combine(storage, "nya", "SKILL.md")));
        Assert.Contains(
            "`dotnet tool run skies nya check`",
            File.ReadAllText(Path.Combine(storage, "nya", "SKILL.md")));
        Assert.Contains(
            "`dotnet tool run skies context --task",
            File.ReadAllText(Path.Combine(storage, "rtw", "SKILL.md")));
        Assert.Contains(
            "`dotnet tool run skies check --task",
            File.ReadAllText(Path.Combine(storage, "nwc", "SKILL.md")));
        Assert.True(File.Exists(Path.Combine(storage, "rtw", "ways", ".gitkeep")));
        Assert.True(File.Exists(Path.Combine(storage, "wtw", "records", "invariants", ".gitkeep")));
        Assert.True(File.Exists(Path.Combine(storage, "nwc", "deferments", ".gitkeep")));
    }

    [Fact]
    public void An_outdated_managed_skill_fails_even_when_the_store_exists()
    {
        var root = NewDir();
        CreateCompleteProject(root);
        File.WriteAllText(
            Path.Combine(root, ".skies", "csm", "rtw", "SKILL.md"),
            "Run `dotnet tool run skies rtw guide`.");

        var outcome = CsmProject.Check(root);

        Assert.False(outcome.Valid);
        Assert.Contains(outcome.Messages, message => message.Contains("rtw add"));
        Assert.Contains(outcome.Messages, message => message.Contains("rtw check"));
    }

    [Fact]
    public void The_application_template_carries_the_complete_csm_protocol()
    {
        var template = Path.Combine(RepoRoot(), "templates", "skies-app");

        Assert.True(CsmProject.Check(template).Valid);
        Assert.False(Directory.Exists(Path.Combine(template, ".nya")));
        Assert.False(Directory.Exists(Path.Combine(template, ".rtw")));
        Assert.False(Directory.Exists(Path.Combine(template, ".wtw")));
        Assert.False(Directory.Exists(Path.Combine(template, ".nwc")));
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

    private static void CreateCompleteProject(string root, string storageRoot = ".skies/csm")
    {
        WriteConfig(root, storageRoot);
        var storage = Path.Combine(root, storageRoot.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(storage);
        File.WriteAllText(Path.Combine(storage, ".gitignore"), "**/index*.sqlite\n");
        File.WriteAllText(Path.Combine(storage, "lock.toml"), "schema = 1\n");
        Directory.CreateDirectory(Path.Combine(storage, "nya", "scars"));
        Directory.CreateDirectory(Path.Combine(storage, "rtw", "ways"));
        Directory.CreateDirectory(Path.Combine(storage, "wtw", "records", "decisions"));
        Directory.CreateDirectory(Path.Combine(storage, "wtw", "records", "invariants"));
        Directory.CreateDirectory(Path.Combine(storage, "nwc", "deferments"));
        File.WriteAllText(Path.Combine(storage, "nya", "config.toml"), "schema = 1\n");
        File.WriteAllText(
            Path.Combine(storage, "nya", "SKILL.md"),
            Commands("nya", "recall", "spec", "check", "replay"));
        File.WriteAllText(
            Path.Combine(storage, "rtw", "SKILL.md"),
            Commands("rtw", "guide", "add", "check"));
        File.WriteAllText(
            Path.Combine(storage, "wtw", "SKILL.md"),
            Commands("wtw", "explain", "collect", "guard"));
        File.WriteAllText(
            Path.Combine(storage, "nwc", "SKILL.md"),
            Commands("nwc", "wake", "resolve", "collect", "check"));
        File.WriteAllText(Path.Combine(root, "AGENTS.md"), FoundationInstructions.Block);
    }

    private static string Commands(string id, params string[] operations) =>
        string.Join(
            Environment.NewLine,
            new[]
            {
                "Run `dotnet tool run skies context --task \"<goal>\"`.",
                "Run `dotnet tool run skies check --task \"<goal>\" --staged`.",
            }.Concat(operations.Select(operation =>
                $"Run `dotnet tool run skies {id} {operation}`.")));

    private static void WriteConfig(string root, string storageRoot)
    {
        File.WriteAllText(
            Path.Combine(root, CsmProject.ConfigFile),
            $"schema = 1\n[storage]\nroot = \"{storageRoot}\"\n");
    }

    private static string NewDir()
    {
        var path = Path.Combine(
            Path.GetTempPath(),
            "skies-csm-project-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }

    private static string RepoRoot([CallerFilePath] string thisFile = "") =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(thisFile)!, "..", ".."));
}
