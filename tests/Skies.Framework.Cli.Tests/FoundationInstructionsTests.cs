using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class FoundationInstructionsTests
{
    [Fact]
    public void Individual_agent_blocks_collapse_into_one_primary_agent_contract()
    {
        var existing =
            """
            # Repository

            Keep this project green.

            <!-- nya:instructions:start -->
            old nya instructions
            <!-- nya:instructions:end -->

            <!-- rtw:instructions:start -->
            old rtw instructions
            <!-- rtw:instructions:end -->
            """;

        var result = FoundationInstructions.Consolidate(existing);

        Assert.Contains("# Repository", result);
        Assert.Contains("Keep this project green.", result);
        Assert.DoesNotContain("old nya instructions", result);
        Assert.DoesNotContain("old rtw instructions", result);
        Assert.Equal(1, Count(result, FoundationInstructions.StartMarker));
        Assert.Contains("dotnet tool run skies context", result);
        Assert.Contains("dotnet tool run skies check", result);
        Assert.Contains("--staged", result);
        Assert.Contains("--base <target-revision> --fast", result);
        Assert.Contains("release automation runs `--full`", result);
        Assert.Contains("intentionally invalid", result);
        Assert.Contains("Never create or", result);
    }

    [Fact]
    public void Synchronization_is_idempotent_and_supports_custom_agent_files()
    {
        var root = NewDir();
        FoundationInstructions.Write(root, ["docs/AI.md"]);
        var first = File.ReadAllText(Path.Combine(root, "docs", "AI.md"));

        FoundationInstructions.Write(root, ["docs/AI.md"]);
        var second = File.ReadAllText(Path.Combine(root, "docs", "AI.md"));

        Assert.Equal(first, second);
        Assert.Equal(1, Count(second, FoundationInstructions.StartMarker));
    }

    [Fact]
    public void An_unclosed_retired_block_is_removed_fail_closed()
    {
        var result = FoundationInstructions.Consolidate(
            "keep\n<!-- nwc:instructions:start -->\nstale");

        Assert.StartsWith("keep", result);
        Assert.DoesNotContain("stale", result);
        Assert.Contains(FoundationInstructions.StartMarker, result);
    }

    private static int Count(string value, string fragment) =>
        value.Split(fragment, StringSplitOptions.None).Length - 1;

    private static string NewDir()
    {
        var path = Path.Combine(
            Path.GetTempPath(),
            "skies-foundation-instructions-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }
}
