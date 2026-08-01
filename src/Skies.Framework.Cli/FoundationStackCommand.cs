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
        var root = Directory.GetCurrentDirectory();
        if (operation == "init")
            CsmProject.EnsureConfiguration(root);
        else if (!File.Exists(Path.Combine(root, CsmProject.ConfigFile)))
        {
            Console.Error.WriteLine(
                "skies foundations: CSM is not initialized; run `dotnet tool run skies foundations init`.");
            return 2;
        }

        var result = operation == "init"
            ? CsmCommand.Initialize(CsmProject.HasStandaloneStores(root))
            : CsmCommand.Synchronize();
        if (result == 0)
        {
            FoundationInstructions.Write(root, agentFiles);
            Console.WriteLine(operation == "init"
                ? "skies foundations: CSM now manages NYA, WTW, RTW, and NWC behind one primary-agent workflow."
                : "skies foundations: CSM tools and agent instructions are synchronized.");
        }
        return result;
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

            Init creates CSM storage under .skies/csm or safely adopts legacy standalone stores.
            Sync installs the CSM-pinned NYA, WTW, RTW, and NWC versions. Both commands keep
            one primary-agent workflow in the selected instruction files.
            """);
        return error ? 2 : 0;
    }
}
