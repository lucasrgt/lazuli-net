using System.Runtime.InteropServices;

namespace Skies.Framework.Cli;

/// <summary>Runs the framework-pinned Right This Way binary.</summary>
internal static class RtwCommand
{
    internal const string Version = "0.1.4";
    internal static readonly FoundationTool Tool = new(
        "rtw",
        "Right This Way",
        Version,
        "lucasrgt/right-this-way",
        "ways",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "25e1c011339b53c3e326a65ba281509789e8958f5a9486701eefd34844a1e3da",
            ["aarch64-unknown-linux-gnu"] = "2626ff824722e948f2c47c3df7095e5206a716113b6adc08ecb993632c783fa1",
            ["x86_64-apple-darwin"] = "82a51e6b7997f268ec6fead45ff6e951291157728a54742e9647613c6a626300",
            ["x86_64-pc-windows-msvc"] = "2fbe4ca7ba97c20f8a3bc36402bf39158cfb964b61d8ce01114b74e3f57e0681",
            ["x86_64-unknown-linux-gnu"] = "39f5ca3c681b3576cb552bbf9fe01e5c687f0ceae4b3ff88d8d72a0874980f4d",
        });

    /// <summary>Resolve, install, and execute RTW with every argument passed after <c>skies rtw</c>.</summary>
    public static int Run(string[] arguments) => Tool.Run(arguments);

    internal static string Target(string platform, Architecture architecture) =>
        FoundationTool.Target("Right This Way", Version, platform, architecture);

    internal static bool ChecksumMatches(byte[] archive, string target) =>
        Tool.ChecksumMatches(archive, target);

    internal static void AdaptProjectInstructions(string root) => Tool.AdaptProjectInstructions(root);
}
