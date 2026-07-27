namespace AeroFortress.Framework.Cli;

/// <summary>Initializes every repository-local agent foundation through its pinned native CLI.</summary>
internal static class FoundationStackCommand
{
    /// <summary>Initialize NYA, WTW, RTW, and NWC while preserving selected agent instruction files.</summary>
    internal static int Run(string[] arguments)
    {
        if (arguments is ["--help"] or ["-h"])
            return Usage();
        if (arguments is not ["init", .. var rest])
            return Usage(error: true);

        IReadOnlyList<string> agentFiles;
        try
        {
            agentFiles = ParseAgentFiles(rest, Directory.GetCurrentDirectory());
        }
        catch (ArgumentException exception)
        {
            Console.Error.WriteLine($"af foundations: {exception.Message}");
            return 2;
        }

        foreach (var file in agentFiles.Where(IsRootAgentFile))
        {
            var path = Path.Combine(Directory.GetCurrentDirectory(), file);
            if (!File.Exists(path))
                File.WriteAllText(path, "");
        }
        var agentArguments = agentFiles
            .SelectMany(file => new[] { "--agent-file", file })
            .ToArray();
        var results = new[]
        {
            NyaCommand.Run(["init"]),
            WtwCommand.Run(["init", .. agentArguments]),
            RtwCommand.Run(["init", .. agentArguments]),
            NwcCommand.Run(["init", .. agentArguments]),
        };
        if (results.All(code => code == 0))
            Console.WriteLine("af foundations: NYA, WTW, RTW, and NWC project protocols are initialized.");
        return results.Max();
    }

    internal static IReadOnlyList<string> ParseAgentFiles(string[] arguments, string root)
    {
        var files = new List<string>();
        for (var index = 0; index < arguments.Length; index++)
        {
            if (arguments[index] != "--agent-file" || index + 1 >= arguments.Length)
                throw new ArgumentException(
                    "usage: af foundations init [--agent-file <path>]...");
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
              af foundations init [--agent-file <path>]...

            Initializes the versioned NYA, WTW, RTW, and NWC repository protocols through
            framework-pinned verified binaries. If no agent file is supplied, existing
            AGENTS.md, CLAUDE.md, and GEMINI.md files are detected automatically.
            """);
        return error ? 2 : 0;
    }
}
