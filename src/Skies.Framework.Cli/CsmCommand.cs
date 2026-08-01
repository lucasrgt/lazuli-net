using System.Runtime.InteropServices;

namespace Skies.Framework.Cli;

/// <summary>Runs the Skies-pinned Codebase Semantic Memory bundle.</summary>
internal static class CsmCommand
{
    internal const string Version = "0.1.0";

    internal static readonly FoundationTool Tool = new(
        "csm",
        "Codebase Semantic Memory",
        Version,
        "lucasrgt/codebase-semantic-memory",
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "eb581e4c58b3e32ab3afb4c87973e6b8d737afea4cdd7a76b5e2153c99c59588",
            ["aarch64-unknown-linux-gnu"] = "21e9d5094b0e0e5485549ed231ad0dbef5d15ae2545e3d479794076545515d3b",
            ["x86_64-apple-darwin"] = "6a0367411b0e7ba32c4553c3e5d02c3d94c439dfdeb91f8df31ec1bfcc60b135",
            ["x86_64-pc-windows-msvc"] = "059aab99f110bf133873561b27f0df516a54fb8aac5c631effff829181c429f8",
            ["x86_64-unknown-linux-gnu"] = "096d9bb6f60707e16e12c095cae7fe80d978b3dd504832ecc2f8cce8c967fa78",
        });

    private static bool ready;

    /// <summary>Run one CSM-managed tool through the Skies command surface.</summary>
    internal static int RunTool(string id, string[] arguments)
    {
        var readiness = EnsureReady();
        return readiness == 0
            ? Tool.Run([id, .. arguments])
            : readiness;
    }

    /// <summary>Capture one CSM-managed tool for the composed context workflow.</summary>
    internal static FoundationTool.Execution CaptureTool(string id, string[] arguments)
    {
        var readiness = EnsureReady();
        return readiness == 0
            ? Tool.Capture([id, .. arguments])
            : new FoundationTool.Execution(readiness, "", "skies foundations: CSM synchronization failed.\n");
    }

    /// <summary>Initialize a new managed store or adopt a legacy standalone layout.</summary>
    internal static int Initialize(bool adopt)
    {
        var code = Tool.Run([adopt ? "adopt" : "init"]);
        return code == 0 ? MarkReady() : code;
    }

    /// <summary>Synchronize the exact tool versions pinned by CSM.</summary>
    internal static int Synchronize()
    {
        var code = Tool.Run(["sync"]);
        return code == 0 ? MarkReady() : code;
    }

    internal static string Target(string platform, Architecture architecture) =>
        FoundationTool.Target("Codebase Semantic Memory", Version, platform, architecture);

    internal static bool ChecksumMatches(byte[] archive, string target) =>
        Tool.ChecksumMatches(archive, target);

    private static int EnsureReady()
    {
        if (ready)
            return 0;

        var doctor = Tool.Capture(["doctor", "--json"]);
        if (doctor.ExitCode == 0)
            return MarkReady();

        if (doctor.ExitCode != 1)
        {
            if (!string.IsNullOrWhiteSpace(doctor.Error))
                Console.Error.Write(doctor.Error);
            Console.Error.WriteLine(
                "skies foundations: initialize this repository with `dotnet tool run skies foundations init`.");
            return Math.Max(2, doctor.ExitCode);
        }

        Console.WriteLine("skies foundations: synchronizing the CSM-pinned tools...");
        return Synchronize();
    }

    private static int MarkReady()
    {
        try
        {
            CsmProject.AdaptInstructions(Directory.GetCurrentDirectory());
            ready = true;
            return 0;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            Console.Error.WriteLine($"skies foundations: could not adapt CSM skills: {exception.Message}");
            return 2;
        }
    }
}
