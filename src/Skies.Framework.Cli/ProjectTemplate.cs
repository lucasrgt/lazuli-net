namespace Skies.Framework.Cli;

/// <summary>Installs and executes the project template bundled with the Skies tool.</summary>
internal static class ProjectTemplate
{
    /// <summary>Files that make the complete Skies foundation stack non-optional in generated projects.</summary>
    internal static IReadOnlyList<string> RequiredFoundationFiles { get; } =
    [
        Path.Combine(".template.config", "template.json"),
        Path.Combine(".config", "dotnet-tools.json"),
        Path.Combine(".skies", "csm", "nya", "SKILL.md"),
        Path.Combine(".skies", "csm", "rtw", "SKILL.md"),
        Path.Combine(".skies", "csm", "wtw", "SKILL.md"),
        Path.Combine(".skies", "csm", "nwc", "SKILL.md"),
        Path.Combine(".skies", "csm", "lock.toml"),
        Path.Combine(".github", "workflows", "ci.yml"),
        Path.Combine("src", "Skies.Framework.Starter.Api", "Modules", "Health", "Slices", "Ping.Tests.cs"),
        Path.Combine("tests", "Skies.Framework.Starter.Tests", "Skies.Framework.Starter.Tests.csproj"),
        "AGENTS.md",
        "csm.toml",
        "lefthook.yml",
        "Skies.toml",
    ];

    /// <summary>Scaffolds a new application without requiring a separate template package installation.</summary>
    internal static int Scaffold(string name)
    {
        var directory = DirectoryFrom(AppContext.BaseDirectory);
        var missing = RequiredFoundationFiles
            .Where(path => !File.Exists(Path.Combine(directory, path)))
            .ToList();
        if (missing.Count > 0)
        {
            Console.Error.WriteLine(
                $"skies: bundled project template is incomplete at '{directory}'; missing {string.Join(", ", missing)}.");
            return 1;
        }

        var installed = Tooling.Dotnet("new", ["install", directory, "--force"]);
        return installed == 0
            ? Tooling.Dotnet("new", ["skies", "-n", name])
            : installed;
    }

    /// <summary>Resolves the template next to the installed tool.</summary>
    internal static string DirectoryFrom(string toolDirectory) =>
        Path.Combine(toolDirectory, "ProjectTemplate");
}
