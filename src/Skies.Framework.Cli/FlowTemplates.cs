using System.Linq;
using System.Reflection;

namespace Skies.Framework.Cli;

/// <summary>
/// Loads the <c>auth-&lt;flow&gt;/**</c> blueprint templates for an auth sub-flow (otp / oauth / email)
/// and renders each for a concrete app. Unlike <see cref="AuthTemplates"/>, a flow ships a single
/// variant — it only augments the default multi-tenant scaffold — so there are no flag regions to
/// resolve. Rendering is one pass: <c>MyApp</c> → the app name, <c>myapp</c> → its lowercase,
/// applied to content and path alike, exactly as the auth blueprint's token pass.
/// </summary>
internal static class FlowTemplates
{
    // The flow templates ship next to the tool, beside the auth blueprint (tools\Templates\auth-<flow>).
    private static string Root(string flowFolder) =>
        Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!, "Templates", flowFolder);

    /// <summary>Every template's logical path under the flow folder (e.g.
    /// <c>Modules/Account/Slices/VerifyPhone.cs.cstmpl</c>), separator-normalized to <c>/</c>.</summary>
    public static IEnumerable<string> All(string flowFolder)
    {
        var root = Root(flowFolder);
        if (!Directory.Exists(root))
            throw new InvalidOperationException($"flow templates not found next to the tool at {root}");

        return Directory.EnumerateFiles(root, "*.cstmpl", SearchOption.AllDirectories)
            .Select(full => Path.GetRelativePath(root, full).Replace('\\', '/'))
            .OrderBy(p => p, StringComparer.Ordinal);
    }

    /// <summary>The raw template body for <paramref name="logicalPath"/> (tokens not yet replaced).</summary>
    public static string Read(string flowFolder, string logicalPath)
    {
        var full = Path.Combine(Root(flowFolder), logicalPath.Replace('/', Path.DirectorySeparatorChar));
        return File.ReadAllText(full);
    }

    /// <summary>Strip the <c>.cstmpl</c> suffix and apply the same token replacement the content gets, so
    /// a file lands at e.g. <c>Modules/Account/Slices/VerifyPhone.cs</c> under the app's namespace.</summary>
    public static string RenderPath(string logicalPath, string appName, string appLower)
    {
        var withoutSuffix = logicalPath.EndsWith(".cstmpl", StringComparison.Ordinal)
            ? logicalPath[..^".cstmpl".Length]
            : logicalPath;
        return ReplaceTokens(withoutSuffix, appName, appLower);
    }

    /// <summary>Render a template body: replace the app tokens. No flag regions — a flow is one variant.</summary>
    public static string Render(string body, string appName, string appLower) =>
        ReplaceTokens(NormalizeNewlines(body), appName, appLower);

    // MyApp → app name first, then myapp → app lower (order matters: the second must not re-touch
    // what the first produced, and it does not since the app name is mixed-case).
    private static string ReplaceTokens(string text, string appName, string appLower) =>
        text.Replace("MyApp", appName).Replace("myapp", appLower);

    // Normalize CRLF/CR to LF so the written file is stable regardless of the template's on-disk endings.
    private static string NormalizeNewlines(string body) =>
        body.Replace("\r\n", "\n").Replace('\r', '\n');
}
