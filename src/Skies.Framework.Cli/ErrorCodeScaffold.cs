namespace Skies.Framework.Cli;

/// <summary>
/// Shared scaffolding for the <c>*ErrorCodes</c> registries the generators reference. Every error code a slice or
/// entity raises must be a constant on a registry (doctor rule <c>SKY0018</c>), so generated code references one
/// and this ensures the constant exists in the module's registry — creating the registry file if absent,
/// appending the constant if missing. Idempotent: re-running never duplicates or clobbers.
/// </summary>
internal static class ErrorCodeScaffold
{
    /// <summary>Ensure <c>Modules/&lt;module&gt;/&lt;module&gt;ErrorCodes.cs</c> declares
    /// <c>public const string &lt;constName&gt; = "&lt;value&gt;"</c>, creating the registry or appending the
    /// constant as needed.</summary>
    public static void EnsureModuleCode(
        string moduleDir, string appNamespace, string module, string constName, string value, string summary)
    {
        var path = Path.Combine(moduleDir, module + "ErrorCodes.cs");
        if (!File.Exists(path))
        {
            File.WriteAllText(path, Registry(appNamespace, module, constName, value, summary));
            Console.WriteLine($"created {path}");
            return;
        }

        var text = File.ReadAllText(path);
        if (text.Contains($"const string {constName} ", StringComparison.Ordinal))
            return;

        var newline = text.Contains("\r\n", StringComparison.Ordinal) ? "\r\n" : "\n";
        var lastBrace = text.LastIndexOf('}');
        if (lastBrace < 0)
            return;

        var member = $"{newline}    /// <summary>{summary}</summary>{newline}"
                   + $"    public const string {constName} = \"{value}\";{newline}";
        File.WriteAllText(path, text[..lastBrace] + member + text[lastBrace..]);
        Console.WriteLine($"added {module}ErrorCodes.{constName}");
    }

    private static string Registry(string appNamespace, string module, string constName, string value, string summary) => $$"""
        namespace {{appNamespace}}.Modules.{{module}};

        /// <summary>The {{module}} module's error codes — stable, namespaced i18n keys the frontend localizes from.
        /// Every Error/Check references a const here (SKY0018), so the full set stays discoverable: AddSkiesOpenApi
        /// enumerates it into the OpenAPI ErrorBody.code schema for the typed client.</summary>
        public static class {{module}}ErrorCodes
        {
            /// <summary>{{summary}}</summary>
            public const string {{constName}} = "{{value}}";
        }

        """;
}
