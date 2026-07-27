using AeroFortress.Framework.Cli;

namespace AeroFortress.Framework.Cli.Tests;

public class FoundationStackCommandTests
{
    [Fact]
    public void Agent_files_are_detected_when_the_caller_does_not_select_them()
    {
        var root = NewDir();
        File.WriteAllText(Path.Combine(root, "AGENTS.md"), "");
        File.WriteAllText(Path.Combine(root, "CLAUDE.md"), "");

        var files = FoundationStackCommand.ParseAgentFiles([], root);

        Assert.Equal(["AGENTS.md", "CLAUDE.md"], files);
    }

    [Fact]
    public void Explicit_agent_files_are_deduplicated_without_vendor_assumptions()
    {
        var files = FoundationStackCommand.ParseAgentFiles(
            ["--agent-file", "GEMINI.md", "--agent-file", "gemini.md"],
            NewDir());

        Assert.Equal(["GEMINI.md"], files);
    }

    [Fact]
    public void A_custom_agent_surface_keeps_a_root_protocol_surface_for_nya()
    {
        var files = FoundationStackCommand.ParseAgentFiles(
            ["--agent-file", "docs/AI.md"],
            NewDir());

        Assert.Equal(["docs/AI.md", "AGENTS.md"], files);
    }

    [Fact]
    public void A_repository_without_agent_instructions_gets_the_portable_default()
    {
        Assert.Equal(["AGENTS.md"], FoundationStackCommand.ParseAgentFiles([], NewDir()));
    }

    [Fact]
    public void Unknown_or_incomplete_options_fail_before_any_tool_runs()
    {
        Assert.Throws<ArgumentException>(
            () => FoundationStackCommand.ParseAgentFiles(["--unknown"], NewDir()));
        Assert.Throws<ArgumentException>(
            () => FoundationStackCommand.ParseAgentFiles(["--agent-file"], NewDir()));
    }

    private static string NewDir()
    {
        var path = Path.Combine(
            Path.GetTempPath(),
            "aerofortress-foundation-stack-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }
}
