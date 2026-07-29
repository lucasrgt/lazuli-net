using System.Runtime.InteropServices;

namespace Skies.Framework.Cli;

/// <summary>Runs the framework-pinned Why This Way binary.</summary>
internal static class WtwCommand
{
    internal const string Version = "0.1.5";
    internal static readonly FoundationTool Tool = new(
        "wtw",
        "Why This Way",
        Version,
        "lucasrgt/why-this-way",
        "records/decisions",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "580b2771238d926d9430a7ebf58bd696644551392724e5c7c8e63519d710f937",
            ["aarch64-unknown-linux-gnu"] = "a8482f663a7fcb9e9d40391838a33bd501adfb91ad7a950adeec143a09f38cb3",
            ["x86_64-apple-darwin"] = "931c023aca4031163db31b36a468c7da26fa7789907f3e7a688c1b16ac7e7f48",
            ["x86_64-pc-windows-msvc"] = "b3134e9f09e83127ea3e5fa09313ff0027b183dd6402ba76a67c0757efdc83fd",
            ["x86_64-unknown-linux-gnu"] = "e7f901aab8acad7e3679734524e28a3278771d12b4567028a2c02b989b287763",
        },
        projectDirectory: ".wtw",
        additionalDurableDirectories: ["records/invariants"]);

    /// <summary>Resolve, install, and execute WTW with every argument passed after <c>skies wtw</c>.</summary>
    public static int Run(string[] arguments) => Tool.Run(arguments);

    internal static string Target(string platform, Architecture architecture) =>
        FoundationTool.Target("Why This Way", Version, platform, architecture);

    internal static bool ChecksumMatches(byte[] archive, string target) =>
        Tool.ChecksumMatches(archive, target);

    internal static void AdaptProjectInstructions(string root) => Tool.AdaptProjectInstructions(root);
}
