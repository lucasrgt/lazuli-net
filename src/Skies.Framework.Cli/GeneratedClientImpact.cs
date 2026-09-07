using System.Diagnostics;
using System.Text.Json;

namespace Skies.Framework.Cli;

/// <summary>Maps changed generated exports through real TypeScript imports, using the same Git delta as the gate.</summary>
internal static class GeneratedClientImpact
{
    internal static bool IsGenerated(string path) =>
        path.Replace('\\', '/').Split('/').Any(part => part is "client.gen" or "generated");

    internal static IReadOnlyList<string>? Select(
        string workspace, FrontendPackage package, IReadOnlyList<string> changes, GitComparison? comparison,
        List<string> reasons, IReadOnlyList<FrontendPackage>? packages = null)
    {
        var sources = changes.Where(path => IsGenerated(path)
            && (path.EndsWith(".ts", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith(".tsx", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith(".js", StringComparison.OrdinalIgnoreCase))).ToArray();
        if (sources.Length == 0)
            return [];
        ArgumentNullException.ThrowIfNull(comparison);
        if (package.Platform != FrontendPlatform.React)
            return Fallback(reasons, "generated client belongs to a non-TypeScript package");

        var script = Path.Combine(AppContext.BaseDirectory, "Tools", "frontend-impact-cli.mjs");
        var info = new ProcessStartInfo("node")
        {
            WorkingDirectory = package.Path,
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        info.ArgumentList.Add(script);
        try
        {
            using var process = Process.Start(info);
            if (process is null)
                return Fallback(reasons, "TypeScript impact process did not start");
            var output = process.StandardOutput.ReadToEndAsync();
            var error = process.StandardError.ReadToEndAsync();
            process.StandardInput.Write(JsonSerializer.Serialize(new
            {
                workspace,
                packageRoot = package.Path,
                packageRoots = (packages ?? [package]).Where(item => item.Platform == FrontendPlatform.React)
                    .Select(item => item.Path).ToArray(),
                changedPaths = sources,
                before = comparison.Before,
                after = comparison.After,
            }));
            process.StandardInput.Close();
            process.WaitForExit();
            _ = error.GetAwaiter().GetResult();
            if (process.ExitCode != 0)
                return Fallback(reasons, "TypeScript impact process failed");
            using var result = JsonDocument.Parse(output.GetAwaiter().GetResult());
            if (!result.RootElement.GetProperty("reliable").GetBoolean())
                return Fallback(reasons, result.RootElement.GetProperty("reason").GetString() ?? "unresolved imports");
            var files = result.RootElement.GetProperty("files").EnumerateArray().Select(file => file.GetString()!).ToArray();
            reasons.Add($"frontend: generated exports select {files.Length} TypeScript consumer(s) in {Path.GetFileName(package.Path)}");
            return files;
        }
        catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or IOException or JsonException)
        {
            return Fallback(reasons, "TypeScript impact information is unavailable");
        }
    }

    private static IReadOnlyList<string>? Fallback(List<string> reasons, string reason)
    {
        reasons.Add($"frontend: generated-client impact is uncertain ({reason}); selecting the owning package");
        return null;
    }
}
