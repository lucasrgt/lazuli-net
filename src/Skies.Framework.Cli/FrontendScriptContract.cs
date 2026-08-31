using System.Text.Json;
using System.Text.RegularExpressions;

namespace Skies.Framework.Cli;

/// <summary>
/// Refuses missing and placeholder npm scripts before executing a frontend gate leg. A React E2E target selects
/// Playwright for web or Maestro for React Native, so neither a second engine nor a filtered command can manufacture
/// executable evidence. Flutter's platform gate validates the official <c>integration_test</c> runner separately.
/// </summary>
internal static class FrontendScriptContract
{
    private static readonly Regex Placeholder = new(
        @"^\s*(?:echo\b[^;&|]*|printf\b[^;&|]*|true|exit\s+0)\s*$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex CompletePlaywrightRunner = new(
        @"(?:^|&&\s*)(?:npx\s+(?:--no-install\s+)?)?playwright\s+test\s*(?=$|&&)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex CompleteMaestroRunner = new(
        @"(?:^|&&\s*)maestro\s+test\s+(?:\.?[\\/]?e2e|\.?[\\/]?maestro)\s*(?=$|&&)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex NoncanonicalE2eRunner = new(
        @"\b(?:cypress|detox)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>Validate and run one required package script, returning a nonzero gate result on contract drift.</summary>
    public static int Run(string packageRoot, string script, params string[] arguments)
    {
        var error = Validate(packageRoot, script);
        if (error is not null)
        {
            Console.Error.WriteLine($"  frontend script contract: {error}");
            return 1;
        }

        return Tooling.Run("npm", ["run", script, .. arguments], packageRoot);
    }

    /// <summary>
    /// Prefer a dedicated unit-test script when a package composes unit and E2E execution under <c>test</c>.
    /// Gate-owned Vitest filters must reach the unit runner instead of being appended to a nested script chain.
    /// </summary>
    internal static string ResolveUnitTestScript(string packageRoot)
    {
        var path = Path.Combine(packageRoot, "package.json");
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var scripts = document.RootElement.GetProperty("scripts");
        return scripts.TryGetProperty("test:unit", out var unit)
            && unit.ValueKind == JsonValueKind.String
            && !string.IsNullOrWhiteSpace(unit.GetString())
            ? "test:unit"
            : "test";
    }

    /// <summary>Whether a package declares a non-empty script with the supplied name.</summary>
    internal static bool HasScript(string packageRoot, string script)
    {
        var path = Path.Combine(packageRoot, "package.json");
        if (!File.Exists(path))
            return false;

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            return document.RootElement.TryGetProperty("scripts", out var scripts)
                && scripts.ValueKind == JsonValueKind.Object
                && scripts.TryGetProperty(script, out var value)
                && value.ValueKind == JsonValueKind.String
                && !string.IsNullOrWhiteSpace(value.GetString());
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>Return a precise contract error, or <see langword="null"/> when the script is executable.</summary>
    public static string? Validate(string packageRoot, string script)
    {
        var path = Path.Combine(packageRoot, "package.json");
        if (!File.Exists(path))
            return $"{packageRoot} has no package.json";

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            if (!document.RootElement.TryGetProperty("scripts", out var scripts)
                || scripts.ValueKind != JsonValueKind.Object
                || !scripts.TryGetProperty(script, out var value)
                || value.ValueKind != JsonValueKind.String
                || string.IsNullOrWhiteSpace(value.GetString()))
                return $"{Path.GetFileName(packageRoot)} must define an executable `{script}` package script";

            var command = value.GetString()!;
            if (Placeholder.IsMatch(command))
                return $"{Path.GetFileName(packageRoot)} `{script}` is a placeholder (`{command}`), not executable evidence";
            if (script == "test:e2e")
                return ValidateE2eRunner(packageRoot, command);
            return null;
        }
        catch (JsonException exception)
        {
            return $"{Path.GetFileName(packageRoot)} package.json is invalid: {exception.Message}";
        }
    }

    private static string? ValidateE2eRunner(string packageRoot, string command)
    {
        var name = Path.GetFileName(packageRoot);
        if (NoncanonicalE2eRunner.IsMatch(command))
            return $"{name} `test:e2e` invokes a noncanonical runner; target:web uses Playwright and target:native uses Maestro";

        var flowsPath = Path.Combine(packageRoot, "e2e", "flows.json");
        if (!File.Exists(flowsPath))
            return $"{name} must declare e2e/flows.json so target can select the canonical E2E runner";

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(flowsPath));
            if (document.RootElement.ValueKind != JsonValueKind.Array)
                return $"{name} e2e/flows.json must be an array";

            var targets = document.RootElement.EnumerateArray()
                .Where(flow => flow.ValueKind == JsonValueKind.Object
                    && flow.TryGetProperty("target", out var target)
                    && target.ValueKind == JsonValueKind.String)
                .Select(flow => flow.GetProperty("target").GetString())
                .Where(target => target is "web" or "native")
                .ToHashSet(StringComparer.Ordinal);

            if (targets.Count == 0)
                return $"{name} e2e/flows.json declares no target:web or target:native flow";
            if (targets.Contains("web") && !CompletePlaywrightRunner.IsMatch(command))
                return $"{name} target:web requires an unfiltered `playwright test` in `test:e2e`";
            if (targets.Contains("native") && !CompleteMaestroRunner.IsMatch(command))
                return $"{name} target:native requires an unfiltered `maestro test e2e` in `test:e2e`";
            if (!targets.Contains("web") && CompletePlaywrightRunner.IsMatch(command))
                return $"{name} has no target:web flow, so `test:e2e` cannot invoke Playwright";
            if (!targets.Contains("native") && CompleteMaestroRunner.IsMatch(command))
                return $"{name} has no target:native flow, so `test:e2e` cannot invoke Maestro";
            return null;
        }
        catch (JsonException exception)
        {
            return $"{name} e2e/flows.json is invalid: {exception.Message}";
        }
    }
}
