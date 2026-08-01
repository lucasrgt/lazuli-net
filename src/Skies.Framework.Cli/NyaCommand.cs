using System.Runtime.InteropServices;

namespace Skies.Framework.Cli;

/// <summary>Runs the framework-pinned Not You Again binary.</summary>
internal static class NyaCommand
{
    internal const string Version = "1.1.6";
    internal static readonly FoundationTool Tool = new(
        "nya",
        "Not You Again",
        Version,
        "lucasrgt/not-you-again",
        "scars",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "82241347bc064cb0db36d4f68bd427fc3366dabd163b3243f8df373479545de4",
            ["aarch64-unknown-linux-gnu"] = "2f220af6767d609c48c510a948e83ff8dec31d44b3003526268ae25584976057",
            ["x86_64-apple-darwin"] = "2619d5d3b0ec2261c6332dbdd09ace28e4050f456db6cc458f6c641da4a41cf7",
            ["x86_64-pc-windows-msvc"] = "4d8a48e79f1a3098f20d9b63872e2d0a075e8f8a6f68c26ad16e8993d337f7f3",
            ["x86_64-unknown-linux-gnu"] = "de5feea44d4a45c3e242963a57ce9ae32e605930043c7094b9993eb211a7e8ef",
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
