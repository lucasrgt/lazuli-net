using System.Linq;
using System.Reflection;

namespace Skies.Framework.Cli;

/// <summary>
/// Loads the embedded <c>auth/**</c> blueprint templates and renders each one for a concrete app and
/// flag set. Rendering is two passes that never touch each other's concerns:
/// <list type="number">
/// <item><description><b>Flag regions</b> — line-comment markers (<c>//&lt;lz:tenancy&gt;</c> …
/// <c>//&lt;/lz:tenancy&gt;</c> and the <c>!</c> negations, likewise for <c>cookies</c>) keep or drop
/// the enclosed lines per flag; the marker lines themselves always go. So one template carries both
/// the tenancy-on and tenancy-off shape of a file and the generator picks one.</description></item>
/// <item><description><b>Token replacement</b> — <c>MyApp</c> → the app name and <c>myapp</c>
/// → its lowercase, applied to the content and the path alike (namespaces, the cookie name, the JWT
/// audience, the dev secret all fall out of the same replace).</description></item>
/// </list>
/// </summary>
internal static class AuthTemplates
{
    // The templates ship next to the tool (copied to output / packed under tools\Templates\auth).
    private static readonly string Root =
        Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!, "Templates", "auth");

    /// <summary>Every blueprint template's logical path (e.g. <c>Modules/Account/Slices/Login.cs.cstmpl</c>),
    /// separator-normalized to <c>/</c>.</summary>
    public static IEnumerable<string> All()
    {
        if (!Directory.Exists(Root))
            throw new InvalidOperationException($"auth templates not found next to the tool at {Root}");

        return Directory.EnumerateFiles(Root, "*.cstmpl", SearchOption.AllDirectories)
            .Select(full => Path.GetRelativePath(Root, full).Replace('\\', '/'))
            .OrderBy(p => p, StringComparer.Ordinal);
    }

    /// <summary>The raw template body for <paramref name="logicalPath"/> (markers intact, tokens not
    /// yet replaced).</summary>
    public static string Read(string logicalPath)
    {
        var full = Path.Combine(Root, logicalPath.Replace('/', Path.DirectorySeparatorChar));
        return File.ReadAllText(full);
    }

    /// <summary>Strip the <c>.cstmpl</c> suffix and apply the same token replacement the content gets,
    /// so a file lands at e.g. <c>Modules/Account/Slices/Login.cs</c> under the app's namespace.</summary>
    public static string RenderPath(string logicalPath, string appName, string appLower)
    {
        var withoutSuffix = logicalPath.EndsWith(".cstmpl", StringComparison.Ordinal)
            ? logicalPath[..^".cstmpl".Length]
            : logicalPath;
        return ReplaceTokens(withoutSuffix, appName, appLower);
    }

    /// <summary>Render a template body: resolve the flag regions, then replace the app tokens.</summary>
    public static string Render(string body, string appName, string appLower, bool tenancy, bool cookies)
    {
        var resolved = ResolveRegions(body, tenancy, cookies);
        return ReplaceTokens(resolved, appName, appLower);
    }

    // MyApp → app name first, then myapp → app lower (order matters: the second must not
    // re-touch what the first produced, and it does not since the app name is mixed-case).
    private static string ReplaceTokens(string text, string appName, string appLower) =>
        text.Replace("MyApp", appName).Replace("myapp", appLower);

    // Walk the lines once, tracking whether the current line sits inside a region whose flag says
    // drop. Marker lines never survive. A line is kept unless some enclosing region vetoes it.
    private static string ResolveRegions(string body, bool tenancy, bool cookies)
    {
        var output = new List<string>();
        var suppress = 0;   // depth of currently-open regions that evaluate to "drop"

        foreach (var rawLine in SplitLines(body))
        {
            var marker = ParseMarker(rawLine);
            if (marker is { } m)
            {
                if (m.IsOpen)
                {
                    if (!FlagAllows(m, tenancy, cookies))
                        suppress++;
                    else if (suppress > 0)
                        suppress++;   // nested inside an already-suppressed region: keep counting depth
                }
                else
                {
                    if (suppress > 0)
                        suppress--;
                }
                continue;   // the marker line itself is always removed
            }

            if (suppress == 0)
                output.Add(rawLine);
        }

        return string.Join("\n", output);
    }

    // A region opens with "//<lz:NAME>" / "//<lz:!NAME>" and closes with "//</lz:NAME>" /
    // "//</lz:!NAME>", possibly indented. NAME is tenancy | cookies.
    private static Marker? ParseMarker(string line)
    {
        var trimmed = line.Trim();
        if (!trimmed.StartsWith("//<lz:", StringComparison.Ordinal) &&
            !trimmed.StartsWith("//</lz:", StringComparison.Ordinal))
            return null;

        var isOpen = trimmed.StartsWith("//<lz:", StringComparison.Ordinal);
        var inner = isOpen
            ? trimmed["//<lz:".Length..]
            : trimmed["//</lz:".Length..];
        inner = inner.TrimEnd('>');

        var negate = inner.StartsWith('!');
        if (negate)
            inner = inner[1..];

        return new Marker(isOpen, negate, inner);
    }

    // Does this open-marker's flag let the enclosed lines through?
    private static bool FlagAllows(Marker m, bool tenancy, bool cookies)
    {
        var flagOn = m.Name switch
        {
            "tenancy" => tenancy,
            "cookies" => cookies,
            _ => throw new InvalidOperationException($"unknown flag region '{m.Name}'"),
        };
        return m.Negate ? !flagOn : flagOn;
    }

    // Normalize CRLF/CR to LF for a single, stable pass; the writer re-emits LF.
    private static IEnumerable<string> SplitLines(string body) =>
        body.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');

    private readonly record struct Marker(bool IsOpen, bool Negate, string Name);
}
