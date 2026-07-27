namespace Skies.Framework.Cli;

/// <summary>Initializes and synchronizes the repository-local agent foundations.</summary>
internal static class FoundationStackCommand
{
    /// <summary>Initialize or synchronize foundations while preserving selected agent instruction files.</summary>
    internal static int Run(string[] arguments)
    {
        if (arguments is ["--help"] or ["-h"])
            return Usage();
        if (arguments is not [("init" or "sync") and var operation, .. var rest])
            return Usage(error: true);

        IReadOnlyList<string> agentFiles;
        try
        {
            agentFiles = ParseAgentFiles(rest, Directory.GetCurrentDirectory());
        }
        catch (ArgumentException exception)
        {
            Console.Error.WriteLine($"skies foundations: {exception.Message}");
            return 2;
        }

        foreach (var file in agentFiles.Where(IsRootAgentFile))
        {
            var path = Path.Combine(Directory.GetCurrentDirectory(), file);
            if (!File.Exists(path))
                File.WriteAllText(path, "");
        }
        var results = operation == "init"
            ? Initialize(agentFiles)
            : Synchronize();
        if (results.All(code => code == 0))
        {
            FoundationInstructions.Write(Directory.GetCurrentDirectory(), agentFiles);
            Console.WriteLine(operation == "init"
                ? "skies foundations: NYA, WTW, RTW, and NWC are initialized behind one primary-agent workflow."
                : "skies foundations: agent instructions now use one primary-agent workflow.");
        }
        return results.Max();
    }

    private static int[] Initialize(IReadOnlyList<string> agentFiles)
    {
        var agentArguments = agentFiles
            .SelectMany(file => new[] { "--agent-file", file })
            .ToArray();
        return
        [
            NyaCommand.Run(["init"]),
            WtwCommand.Run(["init", .. agentArguments]),
            RtwCommand.Run(["init", .. agentArguments]),
            NwcCommand.Run(["init", .. agentArguments]),
        ];
    }

    private static int[] Synchronize()
    {
        var root = Directory.GetCurrentDirectory();
        NyaCommand.AdaptProjectInstructions(root);
        WtwCommand.AdaptProjectInstructions(root);
        RtwCommand.AdaptProjectInstructions(root);
        NwcCommand.AdaptProjectInstructions(root);
        return [0];
    }

    internal static IReadOnlyList<string> ParseAgentFiles(string[] arguments, string root)
    {
        var files = new List<string>();
        for (var index = 0; index < arguments.Length; index++)
        {
            if (arguments[index] != "--agent-file" || index + 1 >= arguments.Length)
                throw new ArgumentException(
                    "usage: skies foundations init [--agent-file <path>]...");
            files.Add(arguments[++index]);
        }

        if (files.Count == 0)
            files.AddRange(new[] { "AGENTS.md", "CLAUDE.md", "GEMINI.md" }
                .Where(file => File.Exists(Path.Combine(root, file))));
        if (!files.Any(IsRootAgentFile))
            files.Add(new[] { "AGENTS.md", "CLAUDE.md", "GEMINI.md" }
                .FirstOrDefault(file => File.Exists(Path.Combine(root, file)))
                ?? "AGENTS.md");
        return files.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static bool IsRootAgentFile(string file) =>
        new[] { "AGENTS.md", "CLAUDE.md", "GEMINI.md" }
            .Contains(file, StringComparer.OrdinalIgnoreCase);

    private static int Usage(bool error = false)
    {
        var writer = error ? Console.Error : Console.Out;
        writer.WriteLine(
            """
            usage:
              skies foundations init [--agent-file <path>]...
              skies foundations sync [--agent-file <path>]...

            Init installs the versioned NYA, WTW, RTW, and NWC repository protocols through
            framework-pinned verified binaries. Sync consolidates existing agent instructions.
            Both commands install one primary-agent workflow in the selected instruction files.
            """);
        return error ? 2 : 0;
    }
}
