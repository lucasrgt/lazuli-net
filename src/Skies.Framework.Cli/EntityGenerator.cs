using System.Linq;

namespace Skies.Framework.Cli;

/// <summary>
/// Generates a rich domain entity — encapsulated state, no public constructor (born through an <c>Open</c>
/// factory, rehydrated by EF through a private parameterless one), no public setter, and a private
/// <c>EnsureValid</c> invariant funnel — so it passes <c>SKY0014</c> by construction. It is the entity
/// counterpart of <c>g slice</c>: the conventional shape born right, ready for the author to add
/// intention-revealing methods. (For a plain data-bag entity that just needs CRUD, write a simple class
/// and use <c>g crud</c>; reach for a rich <c>[Entity]</c> when there are invariants worth guarding.)
/// </summary>
public static class EntityGenerator
{
    /// <summary>Generate the <paramref name="name"/> entity in <paramref name="module"/> under <paramref name="root"/>.</summary>
    /// <param name="root">The application project directory (the one holding <c>&lt;App&gt;.Api.csproj</c>).</param>
    /// <param name="module">The module the entity belongs to (it lives at the module root, beside its slices).</param>
    /// <param name="name">The entity's type name (e.g. <c>Wallet</c>, <c>Order</c>).</param>
    public static int Generate(string root, string module, string name)
    {
        var csproj = Directory.GetFiles(root, "*.csproj").FirstOrDefault();
        if (csproj is null)
        {
            Console.Error.WriteLine("skies: no .csproj here — run this from the application project directory.");
            return 1;
        }

        var appNamespace = Path.GetFileNameWithoutExtension(csproj);
        var moduleDir = Path.Combine(root, "Modules", module);
        var path = Path.Combine(moduleDir, name + ".cs");
        if (File.Exists(path))
        {
            Console.Error.WriteLine($"skies: {path} already exists.");
            return 1;
        }

        Directory.CreateDirectory(moduleDir);
        File.WriteAllText(path, Entity(appNamespace, module, name));
        Console.WriteLine($"created {path}");

        // The scaffolded invariant references a registry constant (SKY0018) — ensure the module's registry has it.
        ErrorCodeScaffold.EnsureModuleCode(moduleDir, appNamespace, module,
            "IdRequired", "id.required", "The id is required (entity invariant).");
        Console.WriteLine($"note: register it in AppDb.cs — add `public DbSet<{name}> {name}s => Set<{name}>();` — "
            + $"then grow {name} with intention-revealing methods that funnel through EnsureValid.");
        return 0;
    }

    private static string Entity(string appNamespace, string module, string name) => $$"""
        namespace {{appNamespace}}.Modules.{{module}};

        /// <summary>
        /// {{name}} — a domain entity. It owns its identity and its invariants: no public setter, born through
        /// <see cref="Open"/>, and every create and mutate path returns through <see cref="EnsureValid"/>, so a
        /// {{name}} is never observed or persisted in a broken state.
        /// </summary>
        [Entity]
        public class {{name}}
        {
            /// <summary>The entity's identity, assigned when it is opened.</summary>
            public Guid Id { get; private set; }

            // Parameterless and private: the constructor EF Core materialises through. The domain opens a
            // {{name}} via Open, so there is no public way to construct a blank one.
            private {{name}}() { }

            /// <summary>Open a new {{name}} with the given identity.</summary>
            public static Result<{{name}}> Open(Guid id) =>
                new {{name}} { Id = id }.EnsureValid();

            // Add intention-revealing methods for this entity's state transitions here. A change that can
            // violate an invariant returns Result<{{name}}> and funnels through EnsureValid; one that cannot
            // fail (a value object already guarantees its input) stays a void method.

            // The single invariant funnel: every create and mutate path returns through here. Add this
            // entity's invariants as Check lines so a broken {{name}} can never come to exist.
            private Result<{{name}}> EnsureValid()
            {
                var validation = new Validation()
                    .Check(Id != Guid.Empty, "id", {{module}}ErrorCodes.IdRequired, "is required");
                if (validation.Failed)
                    return validation.ToError();
                return this;
            }
        }

        """;
}
