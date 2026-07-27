using System.Runtime.InteropServices;

namespace Skies.Framework.Cli;

/// <summary>Runs the framework-pinned Not You Again binary.</summary>
internal static class NyaCommand
{
    internal const string Version = "1.1.5";
    internal static readonly FoundationTool Tool = new(
        "nya",
        "Not You Again",
        Version,
        "lucasrgt/not-you-again",
        "scars",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "5809c0345b444184163a017962e18b35825d9108674144ded405393cb421efdc",
            ["aarch64-unknown-linux-gnu"] = "0e96f54e01d01e34073d7fe7e0257d46d2f097a5166dca5c487667f2bea9e43a",
            ["x86_64-apple-darwin"] = "b84e57a4cc1e0b44e752a0dea7c28b5b24f216a1da84cd8b53931cc2ea091ded",
            ["x86_64-pc-windows-msvc"] = "8be1aa4ee501747be2ef537890348a6da07074265c59094846a886be9fa1f3ad",
            ["x86_64-unknown-linux-gnu"] = "e23e27df5af17d528e01e0b2524a601605ddf44d1752c54174f46307f48fa835",
        },
        versionInAssetName: true);

    /// <summary>Resolve, install, and execute NYA with every argument passed after <c>skies nya</c>.</summary>
    public static int Run(string[] arguments) => Tool.Run(arguments);

    internal static string Target(string platform, Architecture architecture) =>
        FoundationTool.Target("Not You Again", Version, platform, architecture);

    internal static bool ChecksumMatches(byte[] archive, string target) =>
        Tool.ChecksumMatches(archive, target);

    internal static void AdaptProjectInstructions(string root) => Tool.AdaptProjectInstructions(root);
}
