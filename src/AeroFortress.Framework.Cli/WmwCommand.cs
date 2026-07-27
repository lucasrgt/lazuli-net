using System.Runtime.InteropServices;

namespace AeroFortress.Framework.Cli;

/// <summary>Runs the framework-pinned Wake Me When binary.</summary>
internal static class WmwCommand
{
    internal const string Version = "0.2.3";
    internal static readonly FoundationTool Tool = new(
        "wmw",
        "Wake Me When",
        Version,
        "lucasrgt/wake-me-when",
        "deferments",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "f93aa355e366018632f6d3f8f1985887986d517b8341bcfade8ddaae88db9d19",
            ["aarch64-unknown-linux-gnu"] = "89cd061af9d39d08edd5c96a8a7d2059b68db05e101af0e91f09c802b14e688f",
            ["x86_64-apple-darwin"] = "f5fa7672a2c5eae0f76f2c6d0b5a6b1a1cbfe5cbbfae312f3c05b3df33fd162e",
            ["x86_64-pc-windows-msvc"] = "aaf290762d7f6eee10472d69ecb3bfc06bed3e5dd25e9eba823efd0e89160377",
            ["x86_64-unknown-linux-gnu"] = "a56ecf4cffa60ee7fa4c63c175497fe4d504b8dddab9824d57da00be92582fcd",
        });

    /// <summary>Resolve, install, and execute WMW with every argument passed after <c>af wmw</c>.</summary>
    public static int Run(string[] arguments) => Tool.Run(arguments);

    internal static string Target(string platform, Architecture architecture) =>
        FoundationTool.Target("Wake Me When", Version, platform, architecture);

    internal static bool ChecksumMatches(byte[] archive, string target) =>
        Tool.ChecksumMatches(archive, target);

    internal static void AdaptProjectInstructions(string root) => Tool.AdaptProjectInstructions(root);
}
