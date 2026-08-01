using System.Runtime.InteropServices;

namespace Skies.Framework.Cli;

/// <summary>Runs the framework-pinned Now We Can binary.</summary>
internal static class NwcCommand
{
    internal const string Version = "0.3.1";
    internal static readonly FoundationTool Tool = new(
        "nwc",
        "Now We Can",
        Version,
        "lucasrgt/now-we-can",
        "deferments",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "1c52c6a3058718b21583ef6fd2221489274e91c7b194e57d7e1207b1fa5bf82e",
            ["aarch64-unknown-linux-gnu"] = "469c321f9a686b20aa1b628fd6a265932ab9e8f78e420bd9acb67d608b40c94e",
            ["x86_64-apple-darwin"] = "649dc373112b2b719a0345af64e8b5085cc57ca133a5c37c10064f8b54d84379",
            ["x86_64-pc-windows-msvc"] = "430f1363489747d9499e6407198280e7a318d887c9b5bea8382e1e217bde21c0",
            ["x86_64-unknown-linux-gnu"] = "79d1df0eda33bde48c74ecc7f8a9cb6621f86115d613eb1413f38862df7535a2",
        });

    /// <summary>Resolve, install, and execute NWC with every argument passed after <c>skies nwc</c>.</summary>
    public static int Run(string[] arguments) => Tool.Run(arguments);

    internal static string Target(string platform, Architecture architecture) =>
        FoundationTool.Target("Now We Can", Version, platform, architecture);

    internal static bool ChecksumMatches(byte[] archive, string target) =>
        Tool.ChecksumMatches(archive, target);

    internal static void AdaptProjectInstructions(string root) => Tool.AdaptProjectInstructions(root);
}
