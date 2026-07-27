using System.Linq;

namespace Skies.Framework.Cli;

/// <summary>
/// Generates a module — a bounded context that owns both halves of its wiring (<c>AddServices</c> for its DI,
/// <c>Map</c> for its routes) — and wires it into the app's explicit module registry (<c>Modules/Modules.cs</c>,
/// best-effort). The module starts empty; add slices with <c>skies g slice &lt;Module&gt; &lt;Name&gt;</c>.
/// </summary>
public static class ModuleGenerator
{
    /// <summary>Generate <paramref name="name"/> module under the <paramref name="root"/> project.</summary>
    public static int Generate(string root, string name)
    {
        var csproj = Directory.GetFiles(root, "*.csproj").FirstOrDefault();
        if (csproj is null)
        {
            Console.Error.WriteLine("skies: no .csproj here — run this from the application project directory.");
            return 1;
        }

        var appNamespace = Path.GetFileNameWithoutExtension(csproj);
        var modulePath = Path.Combine(root, "Modules", name, name + "Module.cs");
        if (File.Exists(modulePath))
        {
            Console.Error.WriteLine($"skies: {modulePath} already exists.");
            return 1;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(modulePath)!);
        File.WriteAllText(modulePath, Module(appNamespace, name));
        Console.WriteLine($"created {modulePath}");

        WireIntoRegistry(root, appNamespace, name);
        return 0;
    }

    // The convention is an explicit registry, no discovery. The generator wires the module on both sides of
    // Modules/Modules.cs (AddServices into AddModules, Map into MapModules) and adds the using — or tells you to,
    // if the registry is missing or looks unusual.
    private static void WireIntoRegistry(string root, string appNamespace, string name)
    {
        var note = $"note: wire the module — add {name}Module.AddServices(services, configuration); to AddModules "
                 + $"and {name}Module.Map(app); to MapModules (Modules/Modules.cs).";

        var registry = Path.Combine(root, "Modules", "Modules.cs");
        if (!File.Exists(registry))
        {
            Console.WriteLine(note);
            return;
        }

        var text = File.ReadAllText(registry);
        if (text.Contains($"{name}Module.Map"))
            return;

        var lastMap = text.LastIndexOf(".Map(app);", StringComparison.Ordinal);
        if (!text.Contains("return services;") || lastMap < 0)
        {
            Console.WriteLine(note);
            return;
        }

        if (!text.Contains($"using {appNamespace}.Modules.{name};"))
            text = $"using {appNamespace}.Modules.{name};{Environment.NewLine}" + text;

        // AddServices before the AddModules `return services;` (the only one — MapModules is void).
        text = text.Replace("        return services;",
            $"        {name}Module.AddServices(services, configuration);{Environment.NewLine}        return services;");

        // Map after the last module's Map line in MapModules.
        lastMap = text.LastIndexOf(".Map(app);", StringComparison.Ordinal);
        var lineEnd = text.IndexOf('\n', lastMap);
        text = text.Insert(lineEnd + 1, $"        {name}Module.Map(app);{Environment.NewLine}");

        File.WriteAllText(registry, text);
        Console.WriteLine($"wired {name}Module into Modules/Modules.cs");
    }

    private static string Module(string appNamespace, string name) => $$"""
        using Skies.Framework.Abstractions;

        namespace {{appNamespace}}.Modules.{{name}};

        /// <summary>The {{name}} module's wiring root — it owns both halves of its composition: AddServices (its
        /// own DI) and Map (its routes, under /{{name.ToLowerInvariant()}}). The module registry calls both; the
        /// doctor (SKY0015/SKY0016) checks the shape and that it is registered.</summary>
        [Module]
        public static class {{name}}Module
        {
            /// <summary>The module's own service registration — empty until a slice needs DI; the seam is uniform.</summary>
            public static IServiceCollection AddServices(IServiceCollection services, IConfiguration configuration) =>
                services;

            public static void Map(IEndpointRouteBuilder app)
            {
                // Register this module's slices here as you generate them. The group carries the module's
                // authorization decision — SKY0022 wants it explicit either way:
                //   var {{name.ToLowerInvariant()}} = app.MapGroup("/{{name.ToLowerInvariant()}}").RequireAuthorization(); // or .AllowAnonymous()
                //   <Slice>.Map({{name.ToLowerInvariant()}});
            }
        }

        """;
}
