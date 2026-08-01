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
        Path.Combine(".design", "contract.toml"),
        Path.Combine(".design", "tokens.tokens.json"),
        Path.Combine(".github", "workflows", "ci.yml"),
        Path.Combine("src", "Skies.Framework.Starter.Api", "Modules", "Health", "Slices", "Ping.Tests.cs"),
        Path.Combine("tests", "Skies.Framework.Starter.Tests", "Skies.Framework.Starter.Tests.csproj"),
        "AGENTS.md",
        "csm.toml",
        "lefthook.yml",
        "package-lock.json",
        "package.json",
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
        if (installed != 0)
            return installed;

        var outputDirectory = Path.GetFullPath(name);
        var scaffolded = Tooling.Dotnet("new", ["skies", "-n", name, "-o", outputDirectory]);
        return scaffolded == 0
            ? ValidateFoundation(outputDirectory, Console.Out, Console.Error)
            : scaffolded;
    }

    /// <summary>Fail closed when the rendered project did not inherit the mandatory semantic foundation.</summary>
    internal static int ValidateFoundation(string root, TextWriter output, TextWriter error)
    {
        var foundation = CsmProject.Check(root);
        if (!foundation.Valid)
        {
            error.WriteLine($"skies: generated project at '{root}' has an incomplete foundation:");
            foreach (var message in foundation.Messages)
                error.WriteLine($"  - {message}");
            error.WriteLine(
                "skies: from that project directory, run `dotnet tool restore` and "
                + "`dotnet tool run skies foundations init` before starting work.");
            return 2;
        }

        output.WriteLine($"skies: foundation initialized at '{root}'.");
        output.WriteLine(
            "skies: next, run `dotnet tool restore`, `npm install`, then "
            + "`dotnet tool run skies context --task \"<goal>\" --path <expected-path>`.");
        return 0;
    }

    /// <summary>Resolves the template next to the installed tool.</summary>
    internal static string DirectoryFrom(string toolDirectory) =>
        Path.Combine(toolDirectory, "ProjectTemplate");
}
