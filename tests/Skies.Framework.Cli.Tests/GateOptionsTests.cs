using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public sealed class GateOptionsTests
{
    [Theory]
    [InlineData("--help")]
    [InlineData("-h")]
    [InlineData("-?")]
    public void Gate_help_is_printed_without_starting_workspace_discovery(string argument)
    {
        var output = new StringWriter();

        Assert.True(GateCommand.TryWriteHelp([argument], output));
        Assert.Contains("local uncommitted paths are excluded", output.ToString());
    }

    [Fact]
    public void Ordinary_gate_arguments_do_not_trigger_help()
    {
        Assert.False(GateCommand.TryWriteHelp(["--affected", "--fast"], TextWriter.Null));
    }

    [Fact]
    public void Gate_defaults_to_the_affected_change_instead_of_the_full_suite()
    {
        Assert.True(GateOptions.TryParse(["App.slnx", "-c", "Release"], out var options, out _));

        Assert.Equal(GateMode.Affected, options.Mode);
        Assert.Equal(["App.slnx", "-c", "Release"], options.ToolArguments);
    }

    [Fact]
    public void Staged_fast_is_a_distinct_precommit_context()
    {
        Assert.True(GateOptions.TryParse(["--staged", "--fast"], out var options, out _));

        Assert.Equal(GateMode.Staged, options.Mode);
        Assert.True(options.Fast);
    }

    [Theory]
    [InlineData("--filter")]
    [InlineData("--filter=Category=Unit")]
    public void A_caller_cannot_shrink_the_gate_with_a_test_filter(string filter)
    {
        Assert.False(GateOptions.TryParse([filter], out _, out var error));

        Assert.Contains("gate-owned", error);
    }

    [Fact]
    public void Full_cannot_masquerade_as_a_fast_gate()
    {
        Assert.False(GateOptions.TryParse(["--full", "--fast"], out _, out var error));

        Assert.Contains("conflict", error);
    }
}
