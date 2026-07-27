namespace Skies.Framework.Cli;

/// <summary>
/// Validates the versioned, team-owned surface of one foundation tool without
/// inspecting personal judge configuration or disposable indexes.
/// </summary>
internal static class FoundationProject
{
    /// <summary>The immutable result of checking one repository protocol.</summary>
    internal sealed record Outcome(bool Valid, IReadOnlyList<string> Messages);

    internal static Outcome Check(
        string root,
        FoundationTool tool,
        IReadOnlyList<string> requiredFiles,
        IReadOnlyList<string> requiredDirectories,
        IReadOnlyList<string> skillCommands)
    {
        var messages = new List<string>();
        foreach (var file in requiredFiles)
            RequireFile(root, tool, file, messages);
        foreach (var directory in requiredDirectories.Where(directory =>
            !Directory.Exists(ProjectPath(root, directory))))
            messages.Add(
                $"{tool.DisplayName}: missing {directory}; run `{tool.FrameworkCommand} init`.");

        var skill = ProjectPath(root, $"{tool.ProjectDirectory}/SKILL.md");
        if (File.Exists(skill))
        {
            var content = File.ReadAllText(skill);
            foreach (var operation in skillCommands.Where(operation =>
                !content.Contains($"`{tool.FrameworkCommand} {operation}", StringComparison.Ordinal)))
                messages.Add(
                    $"{tool.DisplayName}: {tool.ProjectDirectory}/SKILL.md must include "
                    + $"`{tool.FrameworkCommand} {operation}`.");
        }

        var agentFiles = new[] { "AGENTS.md", "CLAUDE.md", "GEMINI.md" }
            .Select(name => Path.Combine(root, name))
            .Where(File.Exists)
            .ToList();
        if (agentFiles.Count == 0 || !agentFiles.Any(path =>
        {
            var content = File.ReadAllText(path);
            return content.Contains(FoundationInstructions.StartMarker, StringComparison.Ordinal)
                && content.Contains("dotnet tool run skies context", StringComparison.Ordinal)
                && content.Contains("dotnet tool run skies check", StringComparison.Ordinal);
        }))
            messages.Add(
                $"{tool.DisplayName}: root agent instructions must include the unified "
                + "Skies foundation workflow using `skies context` and `skies check`.");

        return new Outcome(messages.Count == 0, messages);
    }

    private static void RequireFile(
        string root,
        FoundationTool tool,
        string relative,
        ICollection<string> messages)
    {
        if (!File.Exists(ProjectPath(root, relative)))
            messages.Add(
                $"{tool.DisplayName}: missing {relative}; run `{tool.FrameworkCommand} init`.");
    }

    private static string ProjectPath(string root, string relative) =>
        Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
}
