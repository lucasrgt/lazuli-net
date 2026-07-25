namespace AeroFortress.Framework.Cli;

/// <summary>Validates the versioned NYA project surface without inspecting personal judge configuration.</summary>
internal static class NyaProject
{
    private const string Marker = "<!-- nya:instructions:start -->";
    private const string Command = "dotnet tool run af nya";
    private static readonly string[] SkillCommands = ["recall", "spec", "check", "replay"];

    /// <summary>The immutable result of checking a repository's NYA integration.</summary>
    internal sealed record Outcome(bool Valid, IReadOnlyList<string> Messages);

    /// <summary>Require the store, skill, shared policy, and at least one agent instruction surface.</summary>
    internal static Outcome Check(string root)
    {
        var messages = new List<string>();
        RequireFile(root, ".nya/config.toml", messages);
        RequireFile(root, ".nya/SKILL.md", messages);
        if (!Directory.Exists(Path.Combine(root, ".nya", "scars")))
            messages.Add("NYA: missing .nya/scars; run `dotnet tool run af nya init`.");

        var skill = Path.Combine(root, ".nya", "SKILL.md");
        if (File.Exists(skill))
        {
            var content = File.ReadAllText(skill);
            foreach (var operation in SkillCommands.Where(operation =>
                !content.Contains($"`{Command} {operation}", StringComparison.Ordinal)))
                messages.Add($"NYA: .nya/SKILL.md must include `{Command} {operation}`.");
        }

        var agentFiles = new[] { "AGENTS.md", "CLAUDE.md", "GEMINI.md" }
            .Select(name => Path.Combine(root, name))
            .Where(File.Exists)
            .ToList();
        if (agentFiles.Count == 0 || !agentFiles.Any(path =>
                File.ReadAllText(path).Contains(Marker, StringComparison.Ordinal)
                && File.ReadAllText(path).Contains(Command, StringComparison.Ordinal)))
            messages.Add($"NYA: root agent instructions must include the managed NYA block using `{Command}`.");

        return new Outcome(messages.Count == 0, messages);
    }

    private static void RequireFile(string root, string relative, ICollection<string> messages)
    {
        if (!File.Exists(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar))))
            messages.Add($"NYA: missing {relative}; run `dotnet tool run af nya init`.");
    }
}
