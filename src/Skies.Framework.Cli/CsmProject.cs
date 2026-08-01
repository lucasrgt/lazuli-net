using System.Text.RegularExpressions;

namespace Skies.Framework.Cli;

/// <summary>Defines and validates the Skies-owned CSM repository contract.</summary>
internal static partial class CsmProject
{
    internal const string ConfigFile = "csm.toml";
    internal const string DefaultStorage = ".skies/csm";

    private static readonly IReadOnlyDictionary<string, string[]> SkillCommands =
        new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["nya"] = ["recall", "spec", "check", "replay"],
            ["rtw"] = ["guide", "add", "check"],
            ["wtw"] = ["explain", "collect", "guard"],
            ["nwc"] = ["wake", "resolve", "collect", "check"],
        };

    private static readonly IReadOnlyList<string> RequiredFiles =
    [
        ".gitignore",
        "lock.toml",
        "nya/config.toml",
        "nya/SKILL.md",
        "rtw/SKILL.md",
        "wtw/SKILL.md",
        "nwc/SKILL.md",
    ];

    private static readonly IReadOnlyList<string> RequiredDirectories =
    [
        "nya/scars",
        "rtw/ways",
        "wtw/records/decisions",
        "wtw/records/invariants",
        "nwc/deferments",
    ];

    private static readonly string[] StandaloneStores =
        [".nya", ".rtw", ".wtw", ".nwc", ".wmw", ".notyet", ".agent-first/wtw"];

    /// <summary>The immutable result of checking the shared semantic-memory protocol.</summary>
    internal sealed record Outcome(bool Valid, IReadOnlyList<string> Messages);

    /// <summary>Validate CSM configuration, durable storage, skills, and agent instructions.</summary>
    internal static Outcome Check(string root)
    {
        var messages = new List<string>();
        var config = Path.Combine(root, ConfigFile);
        if (!File.Exists(config))
        {
            messages.Add(
                $"Codebase Semantic Memory: missing {ConfigFile}; run `dotnet tool run skies foundations init`.");
            ReportStandaloneStores(root, messages);
            return new Outcome(false, messages);
        }

        var configured = File.ReadAllText(config);
        var relativeStorage = ConfiguredStorage(configured);
        if (relativeStorage is null)
        {
            messages.Add($"{ConfigFile}: [storage] must declare a non-empty root.");
            return new Outcome(false, messages);
        }

        string storage;
        try
        {
            storage = Path.IsPathRooted(relativeStorage)
                ? Path.GetFullPath(relativeStorage)
                : Path.GetFullPath(Path.Combine(root, relativeStorage));
        }
        catch (Exception exception) when (exception is ArgumentException or NotSupportedException or PathTooLongException)
        {
            messages.Add($"{ConfigFile}: [storage].root is invalid: {exception.Message}");
            return new Outcome(false, messages);
        }
        foreach (var relative in RequiredFiles)
            if (!File.Exists(ProjectPath(storage, relative)))
                messages.Add($"Codebase Semantic Memory: missing {Display(relativeStorage, relative)}; run `dotnet tool run skies foundations sync`.");
        foreach (var relative in RequiredDirectories)
            if (!Directory.Exists(ProjectPath(storage, relative)))
                messages.Add($"Codebase Semantic Memory: missing {Display(relativeStorage, relative)}; run `dotnet tool run skies foundations sync`.");

        foreach (var (id, operations) in SkillCommands)
        {
            var skill = Path.Combine(storage, id, "SKILL.md");
            if (!File.Exists(skill))
                continue;
            var content = File.ReadAllText(skill);
            if (!content.Contains("`dotnet tool run skies context --task", StringComparison.Ordinal)
                || !content.Contains("`dotnet tool run skies check --task", StringComparison.Ordinal))
                messages.Add(
                    $"Codebase Semantic Memory: {Display(relativeStorage, $"{id}/SKILL.md")} must delegate "
                    + "the standard lifecycle to `dotnet tool run skies context --task` and "
                    + "`dotnet tool run skies check --task`.");
            foreach (var operation in operations)
                if (!content.Contains($"`dotnet tool run skies {id} {operation}", StringComparison.Ordinal))
                    messages.Add(
                        $"Codebase Semantic Memory: {Display(relativeStorage, $"{id}/SKILL.md")} must include "
                        + $"`dotnet tool run skies {id} {operation}`.");
        }

        ReportStandaloneStores(root, messages);
        if (!AgentProtocolInstalled(root))
            messages.Add(
                "Codebase Semantic Memory: root agent instructions must include the unified "
                + "Skies staged/affected/full workflow; run `dotnet tool run skies foundations sync`.");
        return new Outcome(messages.Count == 0, messages);
    }

    /// <summary>Create the Skies CSM configuration without changing an existing override.</summary>
    internal static void EnsureConfiguration(string root)
    {
        var path = Path.Combine(root, ConfigFile);
        if (File.Exists(path))
            return;
        File.WriteAllText(
            path,
            """
            schema = 1

            [storage]
            root = ".skies/csm"

            [tools]
            enabled = ["nya", "rtw", "wtw", "nwc"]

            [instructions]
            files = []

            [workflow]
            proof = []
            """ + Environment.NewLine);
    }

    /// <summary>Whether a repository still has a pre-CSM foundation store.</summary>
    internal static bool HasStandaloneStores(string root) =>
        StandaloneStores.Any(relative => Directory.Exists(ProjectPath(root, relative)));

    /// <summary>Keep CSM-generated skills on the Skies wrapper and preserve empty durable stores in Git.</summary>
    internal static void AdaptInstructions(string root)
    {
        var config = Path.Combine(root, ConfigFile);
        if (!File.Exists(config))
            return;
        var relativeStorage = ConfiguredStorage(File.ReadAllText(config));
        if (relativeStorage is null)
            return;
        var storage = Path.IsPathRooted(relativeStorage)
            ? Path.GetFullPath(relativeStorage)
            : Path.GetFullPath(Path.Combine(root, relativeStorage));

        foreach (var id in SkillCommands.Keys)
        {
            var skill = Path.Combine(storage, id, "SKILL.md");
            if (!File.Exists(skill))
                continue;
            var current = File.ReadAllText(skill);
            var canonical = Path.Combine(
                ProjectTemplate.DirectoryFrom(AppContext.BaseDirectory),
                ".skies",
                "csm",
                id,
                "SKILL.md");
            var adapted = File.Exists(canonical)
                ? File.ReadAllText(canonical)
                : current
                    .Replace($"`{id} ", $"`dotnet tool run skies {id} ", StringComparison.Ordinal)
                    .Replace($"`csm {id} ", $"`dotnet tool run skies {id} ", StringComparison.Ordinal);
            if (adapted != current)
                File.WriteAllText(skill, adapted);
        }

        foreach (var relative in RequiredDirectories)
        {
            var durable = ProjectPath(storage, relative);
            if (Directory.Exists(durable) && !Directory.EnumerateFileSystemEntries(durable).Any())
                File.WriteAllText(Path.Combine(durable, ".gitkeep"), "");
        }
    }

    internal static string? ConfiguredStorage(string content)
    {
        var section = StorageSection().Match(content);
        if (!section.Success)
            return null;
        var root = StorageRoot().Match(section.Groups["body"].Value);
        return root.Success && !string.IsNullOrWhiteSpace(root.Groups["value"].Value)
            ? root.Groups["value"].Value
            : null;
    }

    private static void ReportStandaloneStores(string root, ICollection<string> messages)
    {
        var found = StandaloneStores
            .Where(relative => Directory.Exists(ProjectPath(root, relative)))
            .ToList();
        if (found.Count > 0)
            messages.Add(
                "Codebase Semantic Memory: standalone stores remain at "
                + $"{string.Join(", ", found)}; run `dotnet tool run skies foundations init` to adopt them.");
    }

    private static bool AgentProtocolInstalled(string root) =>
        new[] { "AGENTS.md", "CLAUDE.md", "GEMINI.md" }
            .Select(name => Path.Combine(root, name))
            .Where(File.Exists)
            .Any(path => FoundationInstructions.IsCurrent(File.ReadAllText(path)));

    private static string ProjectPath(string root, string relative) =>
        Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));

    private static string Display(string root, string relative) =>
        $"{root.TrimEnd('/', '\\')}/{relative}".Replace('\\', '/');

    [GeneratedRegex(@"(?ms)^\s*\[storage\]\s*(?<body>.*?)(?=^\s*\[|\z)")]
    private static partial Regex StorageSection();

    [GeneratedRegex("^\\s*root\\s*=\\s*\"(?<value>[^\"]+)\"", RegexOptions.Multiline)]
    private static partial Regex StorageRoot();
}
