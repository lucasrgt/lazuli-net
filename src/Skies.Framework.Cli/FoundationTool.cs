using System.Diagnostics;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace Skies.Framework.Cli;

/// <summary>
/// Resolves and runs one framework-pinned native foundation tool. Release assets are
/// verified before they enter the user cache, so consumers need neither a Rust toolchain
/// nor a global installation.
/// </summary>
internal sealed class FoundationTool
{
    internal sealed record Execution(int ExitCode, string Output, string Error);

    private readonly IReadOnlyDictionary<string, string> checksums;
    private readonly bool versionInAssetName;
    private readonly IReadOnlyList<string> durableDirectories;

    internal FoundationTool(
        string id,
        string displayName,
        string version,
        string repository,
        string durableDirectory,
        IReadOnlyDictionary<string, string> checksums,
        bool versionInAssetName = false,
        string? projectDirectory = null,
        IReadOnlyList<string>? additionalDurableDirectories = null)
    {
        Id = id;
        DisplayName = displayName;
        Version = version;
        Repository = repository;
        ProjectDirectory = projectDirectory ?? $".{id}";
        durableDirectories = additionalDurableDirectories is null
            ? [durableDirectory]
            : [durableDirectory, .. additionalDurableDirectories];
        this.checksums = checksums;
        this.versionInAssetName = versionInAssetName;
    }

    internal string Id { get; }
    internal string DisplayName { get; }
    internal string Version { get; }
    internal string Repository { get; }
    internal string ProjectDirectory { get; }
    internal string FrameworkCommand => $"dotnet tool run skies {Id}";

    /// <summary>Resolve, install, and execute the tool with every forwarded argument.</summary>
    internal int Run(string[] arguments)
    {
        var result = Execute(arguments, capture: false);
        if (result.ExitCode == 2 && !string.IsNullOrWhiteSpace(result.Error))
            Console.Error.Write(result.Error);
        return result.ExitCode;
    }

    /// <summary>Execute the tool while capturing machine-readable output for bounded composition.</summary>
    internal Execution Capture(string[] arguments) => Execute(arguments, capture: true);

    private Execution Execute(string[] arguments, bool capture)
    {
        try
        {
            var binary = EnsureInstalled();
            var info = new ProcessStartInfo(binary)
            {
                UseShellExecute = false,
                WorkingDirectory = Directory.GetCurrentDirectory(),
                RedirectStandardOutput = capture,
                RedirectStandardError = capture,
            };
            foreach (var argument in arguments)
                info.ArgumentList.Add(argument);

            using var process = Process.Start(info)
                ?? throw new InvalidOperationException($"could not start {DisplayName} at {binary}");
            var output = capture ? process.StandardOutput.ReadToEndAsync() : null;
            var error = capture ? process.StandardError.ReadToEndAsync() : null;
            process.WaitForExit();
            if (capture)
                Task.WaitAll(output!, error!);
            if (process.ExitCode == 0 && arguments.Contains("init", StringComparer.Ordinal))
                AdaptProjectInstructions(RepositoryArgument(arguments));
            return new Execution(
                process.ExitCode,
                output?.Result ?? "",
                error?.Result ?? "");
        }
        catch (Exception exception) when (exception is IOException
            or HttpRequestException
            or InvalidDataException
            or InvalidOperationException
            or PlatformNotSupportedException
            or System.ComponentModel.Win32Exception
            or TaskCanceledException
            or UnauthorizedAccessException)
        {
            var message = $"skies {Id}: {exception.Message}{Environment.NewLine}"
                + "Run once from a network-enabled host, then retry; the verified binary remains cached."
                + Environment.NewLine;
            return new Execution(2, "", message);
        }
    }

    internal static string Target(string displayName, string version, string platform, Architecture architecture) =>
        (platform.ToLowerInvariant(), architecture) switch
        {
            ("windows", Architecture.X64) => "x86_64-pc-windows-msvc",
            ("linux", Architecture.X64) => "x86_64-unknown-linux-gnu",
            ("linux", Architecture.Arm64) => "aarch64-unknown-linux-gnu",
            ("macos", Architecture.X64) => "x86_64-apple-darwin",
            ("macos", Architecture.Arm64) => "aarch64-apple-darwin",
            _ => throw new PlatformNotSupportedException(
                $"{displayName} {version} has no release asset for {platform}/{architecture}."),
        };

    internal bool ChecksumMatches(byte[] archive, string target) =>
        checksums.TryGetValue(target, out var expected)
        && Convert.ToHexStringLower(SHA256.HashData(archive)) == expected;

    internal void AdaptProjectInstructions(string root)
    {
        foreach (var relative in new[] { $"{ProjectDirectory}/SKILL.md", "AGENTS.md", "CLAUDE.md", "GEMINI.md" })
        {
            var path = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
            if (!File.Exists(path))
                continue;
            var current = File.ReadAllText(path);
            var adapted = current.Replace($"`{Id} ", $"`{FrameworkCommand} ", StringComparison.Ordinal);
            if (adapted != current)
                File.WriteAllText(path, adapted);
        }

        foreach (var relative in durableDirectories)
        {
            var durable = Path.Combine(
                root,
                ProjectDirectory.Replace('/', Path.DirectorySeparatorChar),
                relative.Replace('/', Path.DirectorySeparatorChar));
            if (Directory.Exists(durable) && !Directory.EnumerateFileSystemEntries(durable).Any())
                File.WriteAllText(Path.Combine(durable, ".gitkeep"), "");
        }
    }

    private string EnsureInstalled()
    {
        var supplied = Environment.GetEnvironmentVariable($"SKIES_{Id.ToUpperInvariant()}_BINARY");
        if (!string.IsNullOrWhiteSpace(supplied))
        {
            var explicitPath = Path.GetFullPath(supplied);
            if (!File.Exists(explicitPath))
                throw new InvalidOperationException(
                    $"SKIES_{Id.ToUpperInvariant()}_BINARY does not exist: {explicitPath}");
            return explicitPath;
        }

        var target = RuntimeTarget();
        var executable = OperatingSystem.IsWindows() ? $"{Id}.exe" : Id;
        var binary = Path.Combine(CacheRoot(), Version, target, executable);
        if (File.Exists(binary))
            return binary;

        var asset = versionInAssetName
            ? $"{Id}-v{Version}-{target}.zip"
            : $"{Id}-{target}.zip";
        var url = $"https://github.com/{Repository}/releases/download/v{Version}/{asset}";
        using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd($"Skies/{Version}");
        var archive = client.GetByteArrayAsync(url).GetAwaiter().GetResult();
        if (!ChecksumMatches(archive, target))
            throw new InvalidDataException($"checksum verification failed for {asset}");

        var temporary = Path.Combine(Path.GetTempPath(), $"skies-{Id}-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(temporary);
            var zip = Path.Combine(temporary, asset);
            File.WriteAllBytes(zip, archive);
            var extracted = Path.Combine(temporary, "extracted");
            ZipFile.ExtractToDirectory(zip, extracted);
            var source = Directory.EnumerateFiles(extracted, executable, SearchOption.AllDirectories).Single();
            Directory.CreateDirectory(Path.GetDirectoryName(binary)!);
            File.Copy(source, binary, overwrite: true);
            if (!OperatingSystem.IsWindows())
                File.SetUnixFileMode(
                    binary,
                    UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            Console.WriteLine($"skies {Id}: installed verified {DisplayName} {Version} for {target}.");
            return binary;
        }
        finally
        {
            TryDelete(temporary);
        }
    }

    private string RuntimeTarget()
    {
        var platform = OperatingSystem.IsWindows()
            ? "windows"
            : OperatingSystem.IsLinux()
                ? "linux"
                : OperatingSystem.IsMacOS()
                    ? "macos"
                    : throw new PlatformNotSupportedException(
                        $"{DisplayName} requires Windows, Linux, or macOS.");
        return Target(DisplayName, Version, platform, RuntimeInformation.ProcessArchitecture);
    }

    private string CacheRoot()
    {
        var configured = Environment.GetEnvironmentVariable($"SKIES_{Id.ToUpperInvariant()}_HOME");
        if (!string.IsNullOrWhiteSpace(configured))
            return Path.GetFullPath(configured);
        if (OperatingSystem.IsWindows())
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Skies",
                "tools",
                Id);
        var cache = Environment.GetEnvironmentVariable("XDG_CACHE_HOME");
        if (string.IsNullOrWhiteSpace(cache))
            cache = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".cache");
        return Path.Combine(cache, "skies", "tools", Id);
    }

    private static string RepositoryArgument(IReadOnlyList<string> arguments)
    {
        for (var index = 0; index + 1 < arguments.Count; index++)
            if (arguments[index] == "--repository")
                return Path.GetFullPath(arguments[index + 1]);
        return Directory.GetCurrentDirectory();
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (Directory.Exists(path))
                Directory.Delete(path, recursive: true);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }
}
