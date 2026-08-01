using System.Runtime.InteropServices;

namespace Skies.Framework.Cli;

/// <summary>Runs the framework-pinned Why This Way binary.</summary>
internal static class WtwCommand
{
    internal const string Version = "0.1.6";
    internal static readonly FoundationTool Tool = new(
        "wtw",
        "Why This Way",
        Version,
        "lucasrgt/why-this-way",
        "records/decisions",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "a56608e23e74cf3a9c12135032a0d42d30d05e8376b2c02825ae44ac562549e0",
            ["aarch64-unknown-linux-gnu"] = "1cfe3406277ea57ef88a2b349489779819f5ccfd0693a363ddc55c1048ab2415",
            ["x86_64-apple-darwin"] = "bc98f7d351b7153b3c9276b1be5e61ec0712540e898a2d987c984a00f56c0acf",
            ["x86_64-pc-windows-msvc"] = "460b713e91c567d2fabab3ab629dd8e7656dd17676456d24731116a52229f667",
            ["x86_64-unknown-linux-gnu"] = "92d8862d4a12e52ee25ebe69be7eb965c1edeb1f77be9300f251809971370ad4",
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
