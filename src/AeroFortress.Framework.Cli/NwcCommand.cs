using System.Runtime.InteropServices;

namespace AeroFortress.Framework.Cli;

/// <summary>Runs the framework-pinned Now We Can binary.</summary>
internal static class NwcCommand
{
    internal const string Version = "0.3.0";
    internal static readonly FoundationTool Tool = new(
        "nwc",
        "Now We Can",
        Version,
        "lucasrgt/now-we-can",
        "deferments",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "fa643eeda244b673efa6fb06a2e5a952da5e5fc0c2f7aa4d3b817af6865fd2f7",
            ["aarch64-unknown-linux-gnu"] = "0fa4318eb5f230c12bc57ab149728b47715e172462fb01259ebf91fea226cf0b",
            ["x86_64-apple-darwin"] = "a8246dd0ee715a7a23131ea185610b82e8e36d6721b569877c5eb9815a439451",
            ["x86_64-pc-windows-msvc"] = "f6d5f2dac2884d27eb8d831274775bb4a6ca2d8251841789a3473c961bcc8a26",
            ["x86_64-unknown-linux-gnu"] = "aeb19110e0e25b793c8740fed028e76aa0de345b2f3a0b35ee7b7427443887af",
        });

    /// <summary>Resolve, install, and execute NWC with every argument passed after <c>af nwc</c>.</summary>
    public static int Run(string[] arguments) => Tool.Run(arguments);

    internal static string Target(string platform, Architecture architecture) =>
        FoundationTool.Target("Now We Can", Version, platform, architecture);

    internal static bool ChecksumMatches(byte[] archive, string target) =>
        Tool.ChecksumMatches(archive, target);

    internal static void AdaptProjectInstructions(string root) => Tool.AdaptProjectInstructions(root);
}
