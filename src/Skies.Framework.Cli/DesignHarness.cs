using System.Text.Json;

namespace Skies.Framework.Cli;

/// <summary>Runs the package-pinned Assay Design contract without teaching Skies UI semantics.</summary>
internal static class DesignHarness
{
    internal static bool IsConfigured(string root)
    {
        var contract = Path.Combine(root, ".design", "contract.toml");
        var package = Path.Combine(root, "package.json");
        if (!File.Exists(contract) || !File.Exists(package))
            return false;

        try
        {
            using var manifest = JsonDocument.Parse(File.ReadAllText(package));
            return manifest.RootElement.TryGetProperty("scripts", out var scripts)
                && scripts.TryGetProperty("design:doctor", out var command)
                && command.ValueKind == JsonValueKind.String;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    internal static int Run(string root)
    {
        Console.WriteLine("skies doctor — design contract (Assay Design)...");
        return Tooling.Run(
            "npx",
            ["--no-install", "assay-design", "doctor", "--contract", ".design/contract.toml"],
            root);
    }
}
