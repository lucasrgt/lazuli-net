using System.Runtime.CompilerServices;

namespace Skies.Framework.Cli.Tests;

public sealed class ProjectTemplateTests
{
    [Fact]
    public void Template_is_resolved_beside_the_installed_tool()
    {
        var toolDirectory = Path.Combine("tools", "net10.0", "any");

        var path = ProjectTemplate.DirectoryFrom(toolDirectory);

        Assert.Equal(Path.Combine(toolDirectory, "ProjectTemplate"), path);
    }

    [Fact]
    public void Source_template_contains_the_complete_mandatory_foundation_stack()
    {
        var template = SourceTemplate();

        foreach (var relativePath in ProjectTemplate.RequiredFoundationFiles)
            Assert.True(File.Exists(Path.Combine(template, relativePath)), $"Missing mandatory template file: {relativePath}");

        var testsProject = File.ReadAllText(Path.Combine(
            template, "tests", "Skies.Framework.Starter.Tests", "Skies.Framework.Starter.Tests.csproj"));
        var proof = File.ReadAllText(Path.Combine(
            template, "src", "Skies.Framework.Starter.Api", "Modules", "Health", "Slices", "Ping.Tests.cs"));
        var hooks = File.ReadAllText(Path.Combine(template, "lefthook.yml"));
        var workflow = File.ReadAllText(Path.Combine(template, ".github", "workflows", "ci.yml"));

        Assert.Contains("Assay.Net", testsProject, StringComparison.Ordinal);
        Assert.Contains("[AVP(", proof, StringComparison.Ordinal);
        Assert.Contains("skies check --task 'pre-commit review' --staged --fast", hooks, StringComparison.Ordinal);
        Assert.Contains("skies check --task 'pre-push review' --base origin/main --fast", hooks, StringComparison.Ordinal);
        Assert.Contains("skies check --task \"CI affected verification\" --affected", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("--affected --fast", workflow, StringComparison.Ordinal);
        Assert.Contains("skies check --task \"release verification\" --full", workflow, StringComparison.Ordinal);
        Assert.Contains("tags: [\"v*\"]", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("skies nya check", hooks, StringComparison.Ordinal);
        Assert.DoesNotContain("skies wtw guard", hooks, StringComparison.Ordinal);
        Assert.DoesNotContain("skies rtw check", hooks, StringComparison.Ordinal);
        Assert.DoesNotContain("skies nwc check", hooks, StringComparison.Ordinal);
        Assert.False(Directory.Exists(Path.Combine(template, ".agent-first")));
    }

    [Fact]
    public void Foundation_skills_delegate_the_standard_lifecycle_to_the_primary_agent()
    {
        var template = SourceTemplate();
        var skills = new[]
        {
            Path.Combine(".skies", "csm", "wtw", "SKILL.md"),
            Path.Combine(".skies", "csm", "nwc", "SKILL.md"),
            Path.Combine(".skies", "csm", "nya", "SKILL.md"),
            Path.Combine(".skies", "csm", "rtw", "SKILL.md"),
        };

        foreach (var skill in skills.Select(path => File.ReadAllText(Path.Combine(template, path))))
        {
            Assert.Contains("skies context --task", skill, StringComparison.Ordinal);
            Assert.Contains("skies check --task", skill, StringComparison.Ordinal);
            Assert.Contains("--staged", skill, StringComparison.Ordinal);
            Assert.Contains("--full", skill, StringComparison.Ordinal);
            Assert.Contains("permanent", skill, StringComparison.Ordinal);
        }
    }

    private static string SourceTemplate([CallerFilePath] string source = "") =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(source)!, "..", "..", "templates", "skies-app"));
}
