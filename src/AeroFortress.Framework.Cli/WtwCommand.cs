using System.Runtime.InteropServices;

namespace AeroFortress.Framework.Cli;

/// <summary>Runs the framework-pinned Why This Way binary.</summary>
internal static class WtwCommand
{
    internal const string Version = "0.1.2";
    internal static readonly FoundationTool Tool = new(
        "wtw",
        "Why This Way",
        Version,
        "lucasrgt/why-this-way",
        "records/decisions",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "26fe009a3dd3c20550b0a054d68e57f1c00be4c8e577cfe41a809902ebb99708",
            ["aarch64-unknown-linux-gnu"] = "c45da706b5daf0e41258ec1ef45aa91e104f4f6ecec0abc17b291c3204528cc7",
            ["x86_64-apple-darwin"] = "c609b849b9d65a9bbe9f859a8b887948a145fb1447b88cb9274badd1b49f1759",
            ["x86_64-pc-windows-msvc"] = "b4329f3061f5eecd461d824b224df69a22f913de29e6b2c8bbbdb7b80fe17d85",
            ["x86_64-unknown-linux-gnu"] = "3d6f1b3380f02888f757e127568afa5adcf958e46053e3e8f968fd1b73073577",
        },
        projectDirectory: ".agent-first/wtw",
        additionalDurableDirectories: ["records/invariants"]);

    /// <summary>Resolve, install, and execute WTW with every argument passed after <c>af wtw</c>.</summary>
    public static int Run(string[] arguments) => Tool.Run(arguments);

    internal static string Target(string platform, Architecture architecture) =>
        FoundationTool.Target("Why This Way", Version, platform, architecture);

    internal static bool ChecksumMatches(byte[] archive, string target) =>
        Tool.ChecksumMatches(archive, target);

    internal static void AdaptProjectInstructions(string root) => Tool.AdaptProjectInstructions(root);
}
