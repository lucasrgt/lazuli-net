using System.Diagnostics;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace AeroFortress.Framework.Cli;

/// <summary>
/// Runs the framework-pinned Not You Again binary without requiring a global install.
/// The first invocation downloads one platform asset into the user's cache and verifies
/// it against a checksum embedded in the shipped <c>af</c> package.
/// </summary>
internal static class NyaCommand
{
    internal const string Version = "1.0.6";
    private const string Command = "dotnet tool run af nya";
    private const string ReleaseBase = "https://github.com/lucasrgt/not-you-again/releases/download";

    private static readonly IReadOnlyDictionary<string, string> Checksums =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["aarch64-apple-darwin"] = "34f20dc9c99fec8c3ca9c3249a603ad60b83106b58c679368196d7497d836c78",
            ["aarch64-unknown-linux-gnu"] = "011dc1417c06d56809b7177987caff77ec08cee4729706a721caaa4516d5c9fe",
            ["x86_64-apple-darwin"] = "8adb3835881c34e96b4e02afc705d6d498b4b6be8951eb0d112a19ad2542b03c",
            ["x86_64-pc-windows-msvc"] = "9478f2eb96967d129a178ab56f67d6c8ef38789eb11f013eb2a4a058d923f779",
            ["x86_64-unknown-linux-gnu"] = "4e615b6fe5939ebf32b1e8b2614d9bd81977f8d931d77de79f0f74584f08a980",
        };

    /// <summary>Resolve, install, and execute NYA with every argument passed after <c>af nya</c>.</summary>
    public static int Run(string[] arguments)
    {
        try
        {
            var binary = EnsureInstalled();
            var info = new ProcessStartInfo(binary)
            {
                UseShellExecute = false,
                WorkingDirectory = Directory.GetCurrentDirectory(),
            };
            foreach (var argument in arguments)
                info.ArgumentList.Add(argument);

            using var process = Process.Start(info)
                ?? throw new InvalidOperationException($"could not start NYA at {binary}");
            process.WaitForExit();
            if (process.ExitCode == 0 && arguments.Contains("init", StringComparer.Ordinal))
                AdaptProjectInstructions(RepositoryArgument(arguments));
            return process.ExitCode;
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
            Console.Error.WriteLine($"af nya: {exception.Message}");
            Console.Error.WriteLine("Run once from a network-enabled host, then retry; the verified binary remains cached.");
            return 2;
        }
    }

    internal static string Target(string platform, Architecture architecture) =>
        (platform.ToLowerInvariant(), architecture) switch
        {
            ("windows", Architecture.X64) => "x86_64-pc-windows-msvc",
            ("linux", Architecture.X64) => "x86_64-unknown-linux-gnu",
            ("linux", Architecture.Arm64) => "aarch64-unknown-linux-gnu",
            ("macos", Architecture.X64) => "x86_64-apple-darwin",
            ("macos", Architecture.Arm64) => "aarch64-apple-darwin",
            _ => throw new PlatformNotSupportedException(
                $"NYA {Version} has no release asset for {platform}/{architecture}."),
        };

    internal static bool ChecksumMatches(byte[] archive, string target)
    {
        if (!Checksums.TryGetValue(target, out var expected))
            return false;
        return Convert.ToHexStringLower(SHA256.HashData(archive)) == expected;
    }

    internal static void AdaptProjectInstructions(string root)
    {
        foreach (var relative in new[] { ".nya/SKILL.md", "AGENTS.md", "CLAUDE.md", "GEMINI.md" })
        {
            var path = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
            if (!File.Exists(path))
                continue;
            var current = File.ReadAllText(path);
            var adapted = current.Replace("`nya ", $"`{Command} ", StringComparison.Ordinal);
            if (adapted != current)
                File.WriteAllText(path, adapted);
        }
    }

    private static string EnsureInstalled()
    {
        var supplied = Environment.GetEnvironmentVariable("AEROFORTRESS_NYA_BINARY");
        if (!string.IsNullOrWhiteSpace(supplied))
        {
            var explicitPath = Path.GetFullPath(supplied);
            if (!File.Exists(explicitPath))
                throw new InvalidOperationException($"AEROFORTRESS_NYA_BINARY does not exist: {explicitPath}");
            return explicitPath;
        }

        var target = RuntimeTarget();
        var executable = OperatingSystem.IsWindows() ? "nya.exe" : "nya";
        var binary = Path.Combine(CacheRoot(), Version, target, executable);
        if (File.Exists(binary))
            return binary;

        var asset = $"nya-v{Version}-{target}.zip";
        var url = $"{ReleaseBase}/v{Version}/{asset}";
        using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd($"AeroFortress/{Version}");
        var archive = client.GetByteArrayAsync(url).GetAwaiter().GetResult();
        if (!ChecksumMatches(archive, target))
            throw new InvalidDataException($"checksum verification failed for {asset}");

        var temporary = Path.Combine(Path.GetTempPath(), "af-nya-" + Guid.NewGuid().ToString("N"));
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
                File.SetUnixFileMode(binary, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            Console.WriteLine($"af nya: installed verified NYA {Version} for {target}.");
            return binary;
        }
        finally
        {
            TryDelete(temporary);
        }
    }

    private static string RuntimeTarget()
    {
        var platform = OperatingSystem.IsWindows()
            ? "windows"
            : OperatingSystem.IsLinux()
                ? "linux"
                : OperatingSystem.IsMacOS()
                    ? "macos"
                    : throw new PlatformNotSupportedException("NYA requires Windows, Linux, or macOS.");
        return Target(platform, RuntimeInformation.ProcessArchitecture);
    }

    private static string CacheRoot()
    {
        var configured = Environment.GetEnvironmentVariable("AEROFORTRESS_NYA_HOME");
        if (!string.IsNullOrWhiteSpace(configured))
            return Path.GetFullPath(configured);
        if (OperatingSystem.IsWindows())
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AeroFortress", "tools", "nya");
        var cache = Environment.GetEnvironmentVariable("XDG_CACHE_HOME");
        if (string.IsNullOrWhiteSpace(cache))
            cache = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".cache");
        return Path.Combine(cache, "aerofortress", "tools", "nya");
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
