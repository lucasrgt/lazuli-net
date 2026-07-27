using System.Linq;

namespace Skies.Framework.Cli;

/// <summary>
/// Generates an always-valid value object — immutable, no public constructor, built only through a static
/// <c>From</c> returning <c>Result&lt;T&gt;</c> (the <c>Money.From</c> shape) — so it passes <c>SKY0013</c> by
/// construction. The author fills in the invariant in <c>From</c>; the shape is born right, the way
/// <c>g slice</c> scaffolds a conformant slice. Value objects are generic, so they land in
/// <c>BuildingBlocks/</c>; a module-specific one can be moved into its module by hand.
/// </summary>
public static class ValueObjectGenerator
{
    /// <summary>Generate the <paramref name="name"/> value object under the <paramref name="root"/> project.</summary>
    /// <param name="root">The application project directory (the one holding <c>&lt;App&gt;.Api.csproj</c>).</param>
    /// <param name="name">The value object's type name (e.g. <c>Email</c>, <c>Cpf</c>).</param>
    public static int Generate(string root, string name)
    {
        var csproj = Directory.GetFiles(root, "*.csproj").FirstOrDefault();
        if (csproj is null)
        {
            Console.Error.WriteLine("skies: no .csproj here — run this from the application project directory.");
            return 1;
        }

        var appNamespace = Path.GetFileNameWithoutExtension(csproj);
        var directory = Path.Combine(root, "BuildingBlocks");
        var path = Path.Combine(directory, name + ".cs");
        if (File.Exists(path))
        {
            Console.Error.WriteLine($"skies: {path} already exists.");
            return 1;
        }

        Directory.CreateDirectory(directory);
        File.WriteAllText(path, ValueObject(appNamespace, name));
        Console.WriteLine($"created {path}");
        Console.WriteLine($"note: fill in {name}.From's invariant, then prefer {name} over the raw type in your slices.");
        return 0;
    }

    private static string ValueObject(string appNamespace, string name) => $$"""
        namespace {{appNamespace}}.BuildingBlocks;

        /// <summary>Error codes for the {{name}} value object — stable, namespaced i18n keys the frontend localizes
        /// from. Codes are registry constants (SKY0018), so the set stays discoverable for the OpenAPI contract.</summary>
        public static class {{name}}ErrorCodes
        {
            /// <summary>The value is missing or fails the {{name}} invariant.</summary>
            public const string Required = "{{name.ToLowerInvariant()}}.required";
        }

        /// <summary>
        /// {{name}} — an always-valid value object: the type <em>is</em> the rule. There is no public way to
        /// construct an invalid {{name}}, so any {{name}} in the system is already valid. Fill in the
        /// invariant in <see cref="From"/> (it wraps a string by default — change the wrapped type to fit).
        /// </summary>
        [ValueObject]
        public readonly record struct {{name}}
        {
            /// <summary>The wrapped value.</summary>
            public string Value { get; }

            private {{name}}(string value) => Value = value;

            /// <summary>Build a {{name}}, rejecting an invalid value as a domain error.</summary>
            public static Result<{{name}}> From(string value) =>
                !string.IsNullOrWhiteSpace(value)
                    ? Result<{{name}}>.Ok(new {{name}}(value))
                    : Error.Validation({{name}}ErrorCodes.Required, "{{name.ToLowerInvariant()}} is required");

            /// <inheritdoc />
            public override string ToString() => Value;
        }

        """;
}
