using System.Diagnostics;

namespace Skies.Framework.Cli;

// Thin wire over the .NET tooling: skies verbs carry the blessed defaults, but the engines are
// dotnet's own (test, stryker). We invoke `dotnet <command>` inheriting the current directory and
// stdio, and return its exit code — no reimplementation, just opinionated invocation.
internal static class Tooling
{
    public static int Dotnet(string command, string[] args)
    {
        var info = new ProcessStartInfo("dotnet") { UseShellExecute = false };
        info.ArgumentList.Add(command);
        foreach (var arg in args)
            info.ArgumentList.Add(arg);

        using var process = Process.Start(info);
        if (process is null)
        {
            Console.Error.WriteLine($"skies: could not start 'dotnet {command}'.");
            return 1;
        }

        process.WaitForExit();
        return process.ExitCode;
    }

    // Run an external tool (npm, npx) in a working directory, inheriting stdio — for the frontend leg of the
    // doctor, which shells out to the TS-world harness (eslint + tsc). On Windows the npm/npx shims are .cmd,
    // so they go through cmd.exe; elsewhere the executable is invoked directly.
    public static int Run(
        string exe,
        string[] args,
        string workingDirectory,
        IReadOnlyDictionary<string, string?>? environment = null)
    {
        var windows = OperatingSystem.IsWindows();
        var info = new ProcessStartInfo(windows ? "cmd.exe" : exe)
        {
            UseShellExecute = false,
            WorkingDirectory = workingDirectory,
        };
        if (windows)
        {
            info.ArgumentList.Add("/c");
            info.ArgumentList.Add(exe);
        }
        foreach (var arg in args)
            info.ArgumentList.Add(arg);
        if (environment is not null)
            foreach (var (name, value) in environment)
                info.Environment[name] = value;

        using var process = Process.Start(info);
        if (process is null)
        {
            Console.Error.WriteLine($"skies: could not start '{exe}'.");
            return 1;
        }

        process.WaitForExit();
        return process.ExitCode;
    }
}
