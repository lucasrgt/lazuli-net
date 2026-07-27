using System.Runtime.InteropServices;

namespace Skies.Framework.Cli;

/// <summary>Runs the framework-pinned Right This Way binary.</summary>
internal static class RtwCommand
{
    internal const string Version = "0.1.3";
    internal static readonly FoundationTool Tool = new(
        "rtw",
        "Right This Way",
        Version,
        "lucasrgt/right-this-way",
        "ways",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "e502d6cede22604a850926ef6ab7afb05af4ab078c2df80a56d8b5ecd39b5564",
            ["aarch64-unknown-linux-gnu"] = "fac0cf05dd783473a84c04c46cfc62b7202ec7a04409a1936d00148ff9cf7b49",
            ["x86_64-apple-darwin"] = "e0e6dbc4187d2caa1fb38e39e79d05ba893e764a1b13b3651fe5423b4632d792",
            ["x86_64-pc-windows-msvc"] = "58acb117889bc3e611acf5645dff864530dac079598f2fcdf51921c7118f8511",
            ["x86_64-unknown-linux-gnu"] = "8e42cc97c3e4ead51fd87f0eb44164d3853cdd4eabd490e14565e6cb5e70ec20",
        });

    /// <summary>Resolve, install, and execute RTW with every argument passed after <c>skies rtw</c>.</summary>
    public static int Run(string[] arguments) => Tool.Run(arguments);

    internal static string Target(string platform, Architecture architecture) =>
        FoundationTool.Target("Right This Way", Version, platform, architecture);

    internal static bool ChecksumMatches(byte[] archive, string target) =>
        Tool.ChecksumMatches(archive, target);

    internal static void AdaptProjectInstructions(string root) => Tool.AdaptProjectInstructions(root);
}
