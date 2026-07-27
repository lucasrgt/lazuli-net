using System.Runtime.InteropServices;

namespace AeroFortress.Framework.Cli;

/// <summary>Runs the framework-pinned Not You Again binary.</summary>
internal static class NyaCommand
{
    internal const string Version = "1.1.0";
    internal static readonly FoundationTool Tool = new(
        "nya",
        "Not You Again",
        Version,
        "lucasrgt/not-you-again",
        "scars",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "3eb7b26be3aac4c277d8aaff5e947e2886395f86eea2852a9f2ce809287c26ee",
            ["aarch64-unknown-linux-gnu"] = "7c099ce21b8c25b5c4b5f58aad812e6cbace0567b87769984c2fe785c05ad37a",
            ["x86_64-apple-darwin"] = "6a26ef0a3e8f37886b127ef7c3a267d1625afd4c6b5a680ed26d931db40761c5",
            ["x86_64-pc-windows-msvc"] = "39f39718e4d31a7517cd66ee5865e395a4b280597138698fa64f4aefbe5bbfb2",
            ["x86_64-unknown-linux-gnu"] = "5afefd80151c091977f2a4a11791c618098393c83c5081d2c664c2fcd4665b94",
        },
        versionInAssetName: true);

    /// <summary>Resolve, install, and execute NYA with every argument passed after <c>af nya</c>.</summary>
    public static int Run(string[] arguments) => Tool.Run(arguments);

    internal static string Target(string platform, Architecture architecture) =>
        FoundationTool.Target("Not You Again", Version, platform, architecture);

    internal static bool ChecksumMatches(byte[] archive, string target) =>
        Tool.ChecksumMatches(archive, target);

    internal static void AdaptProjectInstructions(string root) => Tool.AdaptProjectInstructions(root);
}
