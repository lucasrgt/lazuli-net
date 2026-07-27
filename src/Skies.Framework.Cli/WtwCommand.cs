using System.Runtime.InteropServices;

namespace Skies.Framework.Cli;

/// <summary>Runs the framework-pinned Why This Way binary.</summary>
internal static class WtwCommand
{
    internal const string Version = "0.1.4";
    internal static readonly FoundationTool Tool = new(
        "wtw",
        "Why This Way",
        Version,
        "lucasrgt/why-this-way",
        "records/decisions",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "708999912b303acec915f048615a96d6ec678bb3d782a1e939e462959de7c2e5",
            ["aarch64-unknown-linux-gnu"] = "a4e431bfb35d5a301b311c81a486c8ea465e8862da03cb91da01f610c88b05ee",
            ["x86_64-apple-darwin"] = "e9686344654123f0ca44d62a6bdf9b3c9471d65d2cc22cce4c71acedd5484ba5",
            ["x86_64-pc-windows-msvc"] = "c9b826c6a8ca38b79a5a32d1ab572a24b62d9a2fb4a6630fd3c142f03a60b6af",
            ["x86_64-unknown-linux-gnu"] = "170f9fbfbf39105bc2123d17dc2636e308c9ab78d91955ffe138c8d0fa0f2720",
        },
        projectDirectory: ".agent-first/wtw",
        additionalDurableDirectories: ["records/invariants"]);

    /// <summary>Resolve, install, and execute WTW with every argument passed after <c>skies wtw</c>.</summary>
    public static int Run(string[] arguments) => Tool.Run(arguments);

    internal static string Target(string platform, Architecture architecture) =>
        FoundationTool.Target("Why This Way", Version, platform, architecture);

    internal static bool ChecksumMatches(byte[] archive, string target) =>
        Tool.ChecksumMatches(archive, target);

    internal static void AdaptProjectInstructions(string root) => Tool.AdaptProjectInstructions(root);
}
