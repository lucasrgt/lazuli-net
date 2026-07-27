using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;

namespace Skies.Framework.Cli;

/// <summary>
/// Augments an existing tenant-scoped module with the standard CRUD slices for one entity —
/// <c>List</c> / <c>Lookup</c> / <c>LookupMy</c> (only when the entity carries a <c>UserId</c>) /
/// <c>Create</c> / <c>Update</c> / <c>Delete</c> — mirroring what the Skies-Rust
/// <c>conventions [crud, me]</c> auto-generates. Each slice is plain, idiomatic C# the author owns:
/// no runtime magic, just the boilerplate the doctor would otherwise make them hand-write six times.
/// </summary>
/// <remarks>
/// The generator reads the entity's writable scalar fields by regex and splices them into the
/// <c>Create</c>/<c>Update</c> inputs and assignments. Value objects, enums, and other complex types
/// cannot be constructed generically, so they are excluded and reported in a single closing note for
/// the owner to finish by hand. Every emit is idempotent — an existing slice is skipped, never
/// clobbered — and the module's <c>.Map</c> wiring is best-effort: a missing anchor prints a precise
/// manual-step note rather than failing the whole generator. Targets the multi-tenant scaffold; a
/// single-tenant entity prints a note and exits (that variant is a later addition).
/// </remarks>
public static class CrudGenerator
{
    // The scalar types the generator can take straight from a request and assign to a column. Anything
    // outside this set is "complex" (a VO like Email/Cpf, an enum, a nested type) and is left to the owner.
    private static readonly HashSet<string> ScalarTypes = new(StringComparer.Ordinal)
    {
        "string", "string?", "bool", "bool?", "int", "int?", "long", "long?",
        "double", "double?", "decimal", "decimal?", "DateTime", "DateTime?", "Guid", "Guid?",
    };

    // System-owned columns: never taken from the request. Id/CreatedAt/UpdatedAt are stamped by the slice,
    // OrgId by the DbContext, UserId from the caller.
    private static readonly HashSet<string> SystemFields = new(StringComparer.Ordinal)
    {
        "Id", "OrgId", "CreatedAt", "UpdatedAt", "UserId",
    };

    /// <summary>Augment <paramref name="module"/> with CRUD slices for <paramref name="entity"/> under <paramref name="root"/>.</summary>
    /// <param name="root">The application project directory (the one holding <c>&lt;App&gt;.Api.csproj</c>).</param>
    /// <param name="module">The module to augment (must already exist).</param>
    /// <param name="entity">The entity type the CRUD targets (its <c>&lt;Entity&gt;.cs</c> must exist in the module).</param>
    public static int Generate(string root, string module, string entity)
    {
        var csproj = Directory.GetFiles(root, "*.csproj").FirstOrDefault();
        if (csproj is null)
        {
            Console.Error.WriteLine("skies: no .csproj here — run this from the application project directory.");
            return 1;
        }

        var appNamespace = Path.GetFileNameWithoutExtension(csproj);            // e.g. Acme.Api
        var appName = appNamespace.EndsWith(".Api", StringComparison.Ordinal)
            ? appNamespace[..^4]
            : appNamespace;                                                     // e.g. Acme
        var appLower = appName.ToLowerInvariant();

        var moduleDir = Path.Combine(root, "Modules", module);
        var moduleFile = Path.Combine(moduleDir, $"{module}Module.cs");
        if (!File.Exists(moduleFile))
        {
            Console.Error.WriteLine($"skies: no {module} module here — run `skies g module {module}` "
                + "(or `skies g auth` for Account) first.");
            return 1;
        }

        var entityFile = Path.Combine(moduleDir, $"{entity}.cs");
        if (!File.Exists(entityFile))
        {
            Console.Error.WriteLine($"skies: no {entity} entity in {module} — create Modules/{module}/{entity}.cs first.");
            return 1;
        }

        var entityText = File.ReadAllText(entityFile);
        if (!entityText.Contains("ITenantScoped"))
        {
            Console.Error.WriteLine($"skies: {entity} is not ITenantScoped — `g crud` currently targets the "
                + "multi-tenant scaffold (CRUD is tenant-scoped via the module DbContext). Single-tenant CRUD is a later addition.");
            return 1;
        }

        var fields = ParseFields(entityText);
        var hasUserId = entityText.Contains("public Guid UserId") || entityText.Contains("public Guid? UserId");
        var hasCreatedAt = HasProperty(entityText, "CreatedAt");
        var hasUpdatedAt = HasProperty(entityText, "UpdatedAt");
        var plural = DetectDbSet(root, entity);

        var ctx = new Ctx(appName, appLower, module, entity, plural, hasUserId, hasCreatedAt, hasUpdatedAt, fields.Scalars, fields.Complex);

        var slicesDir = Path.Combine(moduleDir, "Slices");
        Directory.CreateDirectory(slicesDir);

        var emitted = new List<string>();
        var slices = new List<string> { $"List{entity}", $"Lookup{entity}" };
        if (hasUserId)
            slices.Add($"LookupMy{entity}");
        slices.AddRange([$"Create{entity}", $"Update{entity}", $"Delete{entity}"]);
        foreach (var slice in slices)
            EmitSlice(ctx, slicesDir, slice, emitted);

        foreach (var slice in slices)
            SpecManifestScaffold.EnsureDeclared(
                moduleDir, module, slice, [CrudAcceptance.CriterionFor(slice, entity)]);
        CrudAcceptance.WireTestProject(root, appName);

        // The Lookup/Update/Delete slices return NotFound via a registry constant (SKY0018) — ensure it exists.
        ErrorCodeScaffold.EnsureModuleCode(moduleDir, appNamespace, module,
            $"{entity}NotFound", $"{Hyphenate(entity)}.not_found", $"No {entity} exists for the given id.");

        AugmentModule(moduleFile, ctx, hasUserId);

        Summarize(ctx, emitted, hasUserId);
        return 0;
    }

    // ---- emit -------------------------------------------------------------------------------------

    // Emit a slice + its co-located test from the crud templates, splicing the entity's fields in.
    // Idempotent: an existing slice file is skipped (and so is its test) so re-running never clobbers.
    private static void EmitSlice(Ctx ctx, string slicesDir, string sliceName, List<string> emitted)
    {
        var slicePath = Path.Combine(slicesDir, $"{sliceName}.cs");
        var testPath = Path.Combine(slicesDir, $"{sliceName}.Tests.cs");

        if (File.Exists(slicePath))
        {
            Console.WriteLine($"skipped {slicePath} (already present)");
            CrudAcceptance.EnsureProof(testPath, sliceName, CrudAcceptance.CriterionFor(sliceName, ctx.Entity));
            return;
        }

        var stem = TemplateName(sliceName, ctx.Entity);
        var sliceTemplate = $"{stem}.cs.cstmpl";
        // When the entity carries complex/VO fields, a generic seeded round-trip can't be constructed, so
        // the test degrades to the not-found / empty-store / contract-only path that still passes.
        var testTemplate = ctx.Complex.Count > 0
            ? $"{stem}.Tests.degraded.cs.cstmpl"
            : $"{stem}.Tests.cs.cstmpl";

        File.WriteAllText(slicePath, Render(Read(sliceTemplate), ctx));
        var test = CrudAcceptance.BindProof(
            Render(Read(testTemplate), ctx), sliceName, CrudAcceptance.CriterionFor(sliceName, ctx.Entity));
        File.WriteAllText(testPath, test);
        Console.WriteLine($"created {slicePath}");
        Console.WriteLine($"created {testPath}");
        emitted.Add(sliceName);
    }

    // Turn the concrete slice name back into its template stem (the entity-bearing part is tokenized).
    private static string TemplateName(string sliceName, string entity) =>
        sliceName.Replace(entity, "__ENTITY__");

    private static string Read(string templateFile)
    {
        var full = Path.Combine(TemplatesRoot(), templateFile);
        return File.ReadAllText(full);
    }

    private static string TemplatesRoot() =>
        Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!, "Templates", "crud");

    // ---- rendering --------------------------------------------------------------------------------

    // One pass over a template: the structural CRUD tokens first (entity/module/plural + the spliced
    // field fragments), then the app-name tokens (MyApp → app), exactly as the auth blueprint does.
    private static string Render(string body, Ctx ctx)
    {
        var text = NormalizeNewlines(body);

        text = text
            .Replace("__MODULE__", ctx.Module)
            .Replace("__ENTITY_LOWER__", Hyphenate(ctx.Entity))
            .Replace("__ENTITY__", ctx.Entity)
            .Replace("__PLURAL__", ctx.Plural);

        // Create — input params, entity assignments, the optional UserId stamp + current-user dependency.
        // The longer __CREATE_CURRENT_ARG__ (test) must resolve before __CURRENT_ARG__ (slice), since the
        // latter is a substring of the former.
        text = text
            .Replace("__CREATE_INPUT_FIELDS__", CreateInputFields(ctx))
            .Replace("__CREATE_ASSIGNMENTS__", CreateAssignments(ctx))
            .Replace("__AUTH_USING__", ctx.HasUserId ? "using MyApp.Api.Auth;\n" : "")
            .Replace("__USERID_ASSIGNMENT__", ctx.HasUserId ? "            UserId = current.UserId,\n" : "")
            .Replace("__CURRENT_PARAM__", ctx.HasUserId ? "ICurrentUser current, " : "")
            .Replace("__CREATE_CURRENT_ARG__", ctx.HasUserId ? "new FakeUser(Guid.NewGuid(), org), " : "")
            .Replace("__CURRENT_ARG__", ctx.HasUserId ? "current, " : "")
            .Replace("__CREATE_TODO__", Todo(ctx, "            "))
            .Replace("__UPDATE_TODO__", Todo(ctx, "        "));

        // Timestamps — only stamped when the entity carries the column, so an entity with just CreatedAt
        // (or neither) still compiles. `now` is declared only when at least one timestamp is written.
        var stampsAny = ctx.HasCreatedAt || ctx.HasUpdatedAt;
        text = text
            .Replace("__NOW_DECL__", stampsAny ? "        var now = clock.GetUtcNow().UtcDateTime;\n" : "")
            .Replace("__CREATED_AT_ASSIGN__", ctx.HasCreatedAt ? "            CreatedAt = now,\n" : "")
            .Replace("__UPDATED_AT_ASSIGN__", ctx.HasUpdatedAt ? "            UpdatedAt = now,\n" : "")
            .Replace("__UPDATE_TOUCH__", ctx.HasUpdatedAt ? "        item.UpdatedAt = clock.GetUtcNow().UtcDateTime;\n" : "")
            .Replace("__ORDER_KEY__", ctx.HasCreatedAt ? "CreatedAt" : "Id");

        // Update — nullable input params + the null-guarded assignments.
        text = text
            .Replace("__UPDATE_INPUT_FIELDS__", UpdateInputFields(ctx))
            .Replace("__UPDATE_ASSIGNMENTS__", UpdateAssignments(ctx));

        // Test fragments.
        text = text
            .Replace("__CREATE_CALL_ARGS__", CreateCallArgs(ctx))
            .Replace("__UPDATE_CALL_ARGS__", UpdateCallArgs(ctx))
            .Replace("__UPDATE_NULL_ARGS__", UpdateNullArgs(ctx))
            .Replace("__SEED_ASSIGNMENTS__", SeedAssignments(ctx))
            .Replace("__SEED_TIMESTAMPS_AT__", SeedTimestamps(ctx, "at"))
            .Replace("__SEED_TIMESTAMPS__", SeedTimestamps(ctx, "DateTime.UtcNow"))
            .Replace("__FAKEUSER__", FakeUser(ctx));

        return ReplaceAppTokens(text, ctx.AppName, ctx.AppLower);
    }

    // The Create Input record params: "string Name, int Age" — scalar writable fields only. When there
    // are none, the record still needs to compile, so we emit a placeholder no-op the route ignores.
    private static string CreateInputFields(Ctx ctx) =>
        ctx.Scalars.Count == 0
            ? "string? Unused = null"
            : string.Join(", ", ctx.Scalars.Select(f => $"{NonNullable(f.Type)} {f.Name}"));

    // The Create entity assignments, one per scalar field, at 12-space indent to sit in the initializer.
    private static string CreateAssignments(Ctx ctx) =>
        ctx.Scalars.Count == 0
            ? ""
            : string.Join("\n", ctx.Scalars.Select(f => $"            {f.Name} = input.{f.Name},")) + "\n";

    // The Update Input record params: every scalar field made nullable for partial update.
    private static string UpdateInputFields(Ctx ctx) =>
        ctx.Scalars.Count == 0
            ? "string? Unused = null"
            : string.Join(", ", ctx.Scalars.Select(f => $"{Nullable(f.Type)} {f.Name} = null"));

    // The Update assignments: each scalar field overwrites its column only when the input is non-null.
    private static string UpdateAssignments(Ctx ctx)
    {
        if (ctx.Scalars.Count == 0)
            return "";
        var sb = new StringBuilder();
        foreach (var f in ctx.Scalars)
        {
            sb.Append($"        if (input.{f.Name} is not null)\n");
            sb.Append($"            item.{f.Name} = input.{f.Name}{ValueSuffix(f.Type)};\n");
        }
        return sb.ToString();
    }

    // A one-line TODO pointing at the skipped complex/VO fields — emitted only when there are any, at the
    // given indent (12 spaces inside the Create initializer, 8 inside the Update method body).
    private static string Todo(Ctx ctx, string indent) =>
        ctx.Complex.Count == 0
            ? ""
            : $"{indent}// TODO: set the complex/VO fields the generator could not auto-wire (see the note it printed).\n";

    // Test: literal scalar values for the Create Input ctor, matching the field order.
    private static string CreateCallArgs(Ctx ctx) =>
        ctx.Scalars.Count == 0
            ? ""
            : string.Join(", ", ctx.Scalars.Select(f => SampleValue(f.Type)));

    // Test: ", value, value" appended after the Update Input's leading Id arg (named so it survives reorder-free).
    private static string UpdateCallArgs(Ctx ctx) =>
        ctx.Scalars.Count == 0
            ? ""
            : ", " + string.Join(", ", ctx.Scalars.Select(f => $"{f.Name}: {SampleValue(f.Type)}"));

    // Test: the not-found Update call passes only the Id; nullable fields default, so nothing else is needed.
    private static string UpdateNullArgs(Ctx ctx) => "";

    // Test seed initializer assignments for the entity's scalar fields (so a seeded row is valid).
    private static string SeedAssignments(Ctx ctx) =>
        ctx.Scalars.Count == 0
            ? ""
            : ", " + string.Join(", ", ctx.Scalars.Select(f => $"{f.Name} = {SampleValue(f.Type)}"));

    // Seed timestamp assignments for a test's entity initializer — only the columns the entity has.
    private static string SeedTimestamps(Ctx ctx, string value)
    {
        var parts = new List<string>();
        if (ctx.HasCreatedAt)
            parts.Add($"CreatedAt = {value}");
        if (ctx.HasUpdatedAt)
            parts.Add($"UpdatedAt = {value}");
        return parts.Count == 0 ? "" : ", " + string.Join(", ", parts);
    }

    // The Create test's FakeUser + a current-user arg are only needed when the entity has UserId.
    private static string FakeUser(Ctx ctx) => ctx.HasUserId
        ? "\n    private sealed class FakeUser(Guid userId, Guid orgId) : ICurrentUser\n"
          + "    {\n"
          + "        public bool IsAuthenticated => true;\n"
          + "        public Guid UserId => userId;\n"
          + "        public Guid OrgId => orgId;\n"
          + "        public string? Role => null;\n"
          + "        public Guid SessionId => Guid.Empty;\n"
          + "    }\n"
        : "";

    // ---- field parsing ----------------------------------------------------------------------------

    private static readonly Regex PropertyRegex = new(
        @"public\s+(?<type>[A-Za-z0-9_<>,\.\? ]+?)\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*\{\s*get;\s*set;\s*\}",
        RegexOptions.Compiled);

    // Read the entity's auto-properties, classifying each as a writable scalar or a complex field.
    private static (List<Field> Scalars, List<Field> Complex) ParseFields(string entityText)
    {
        var scalars = new List<Field>();
        var complex = new List<Field>();

        foreach (Match m in PropertyRegex.Matches(entityText))
        {
            var type = m.Groups["type"].Value.Trim();
            var name = m.Groups["name"].Value.Trim();
            if (SystemFields.Contains(name))
                continue;

            if (ScalarTypes.Contains(type))
                scalars.Add(new Field(name, type));
            else
                complex.Add(new Field(name, type));
        }

        return (scalars, complex);
    }

    // Whether the entity declares an auto-property with the given name (DateTime or DateTime?).
    private static bool HasProperty(string entityText, string name) =>
        Regex.IsMatch(entityText, $@"public\s+DateTime\??\s+{Regex.Escape(name)}\s*\{{");

    // Find the DbSet property name for the entity in the shared AppDb (e.g. "Users" for "User"). Falls back
    // to "<Entity>s" with a note when AppDb or the line is missing — the slices still compile.
    private static string DetectDbSet(string root, string entity)
    {
        var dbFile = Path.Combine(root, "AppDb.cs");
        var fallback = entity + "s";
        if (!File.Exists(dbFile))
        {
            Console.WriteLine($"note: no AppDb.cs — assuming DbSet `{fallback}` for {entity}.");
            return fallback;
        }

        var text = File.ReadAllText(dbFile);
        var match = Regex.Match(text, $@"DbSet<{Regex.Escape(entity)}>\s+(?<plural>[A-Za-z_][A-Za-z0-9_]*)\s*=>");
        if (match.Success)
            return match.Groups["plural"].Value;

        Console.WriteLine($"note: no DbSet<{entity}> in AppDb.cs — assuming `{fallback}`. "
            + $"Add `public DbSet<{entity}> {fallback} => Set<{entity}>();` to AppDb.cs.");
        return fallback;
    }

    // ---- module wiring ----------------------------------------------------------------------------

    // Add the CRUD slices' Map(group) lines to <Module>Module.Map, idempotently, before its closing brace.
    private static void AugmentModule(string moduleFile, Ctx ctx, bool hasUserId)
    {
        var text = File.ReadAllText(moduleFile);
        var nl = Newline(text);

        // The group variable the existing maps use — "var <x> = app.MapGroup(...)" → "<x>".
        var groupMatch = Regex.Match(text, @"var\s+(?<g>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*app\.MapGroup");
        var group = groupMatch.Success ? groupMatch.Groups["g"].Value : "app";

        var slices = new List<string> { $"List{ctx.Entity}", $"Lookup{ctx.Entity}" };
        if (hasUserId)
            slices.Add($"LookupMy{ctx.Entity}");
        slices.AddRange(new[] { $"Create{ctx.Entity}", $"Update{ctx.Entity}", $"Delete{ctx.Entity}" });

        var mapLines = slices.Select(s => $"        {s}.Map({group});").ToList();
        var missing = mapLines.Where(m => !text.Contains(m.Trim())).ToList();
        if (missing.Count == 0)
            return;

        var block = string.Join(nl, missing);
        var anchor = nl + "    }" + nl + "}";
        if (text.Contains(anchor))
        {
            text = ReplaceFirst(text, anchor, nl + block + anchor);
            File.WriteAllText(moduleFile, text);
            Console.WriteLine($"wired {missing.Count} slice map(s) into {ctx.Module}Module.cs");
        }
        else
        {
            foreach (var m in missing)
                Console.WriteLine($"note: add `{m.Trim()}` to {ctx.Module}Module.Map");
        }
    }

    // ---- summary ----------------------------------------------------------------------------------

    private static void Summarize(Ctx ctx, List<string> emitted, bool hasUserId)
    {
        if (!hasUserId)
            Console.WriteLine($"note: {ctx.Entity} has no UserId — LookupMy{ctx.Entity} was not generated (the \"me\" lookup needs an owner column).");

        if (ctx.Complex.Count > 0)
        {
            var list = string.Join(", ", ctx.Complex.Select(f => $"{f.Type} {f.Name}"));
            Console.WriteLine($"note: {ctx.Entity} has complex/VO fields not auto-wired into Create/Update — add by hand: {list}");
        }

        var what = emitted.Count == 0 ? "nothing new (all slices already present)" : string.Join(", ", emitted);
        Console.WriteLine($"crud generated for {ctx.Module}/{ctx.Entity} — {what}. Complete the generated proofs, then run `skies gate`.");
    }

    // ---- type helpers -----------------------------------------------------------------------------

    // The non-nullable form for a Create input param (the entity owns the nullability; create takes the value).
    private static string NonNullable(string type) => type.EndsWith("?", StringComparison.Ordinal) ? type : type;

    // The nullable form for an Update input param: a reference/value type both gain a trailing '?'.
    private static string Nullable(string type) => type.EndsWith("?", StringComparison.Ordinal) ? type : type + "?";

    // When an Update field is a non-nullable value type, the input is "T?"; assigning back to the column
    // needs ".Value". Reference types (string) and already-nullable fields assign directly.
    private static string ValueSuffix(string type)
    {
        if (type.EndsWith("?", StringComparison.Ordinal))
            return "";                       // already nullable in the entity — assign the input directly
        if (type == "string")
            return "";                       // reference type — input is string?, assigns to string fine
        return ".Value";                     // non-nullable value type (int/bool/Guid/...) — unwrap the input
    }

    // A representative literal for a type, used in the generated tests so they compile and round-trip.
    private static string SampleValue(string type) => type.TrimEnd('?') switch
    {
        "string" => "\"sample\"",
        "bool" => "true",
        "int" => "1",
        "long" => "1L",
        "double" => "1.0",
        "decimal" => "1.0m",
        "DateTime" => "DateTime.UtcNow",
        "Guid" => "Guid.NewGuid()",
        _ => "default",
    };

    // ---- text helpers -----------------------------------------------------------------------------

    // MyApp → app name, then myapp → app lower (the second cannot re-touch the first: app name is mixed-case).
    private static string ReplaceAppTokens(string text, string appName, string appLower) =>
        text.Replace("MyApp", appName).Replace("myapp", appLower);

    // PascalCase → kebab for a URL segment ("OrderLine" → "order-line").
    private static string Hyphenate(string pascal)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < pascal.Length; i++)
        {
            var c = pascal[i];
            if (char.IsUpper(c) && i > 0)
                sb.Append('-');
            sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString();
    }

    private static string ReplaceFirst(string text, string find, string replacement)
    {
        var at = text.IndexOf(find, StringComparison.Ordinal);
        return at < 0 ? text : text[..at] + replacement + text[(at + find.Length)..];
    }

    private static string NormalizeNewlines(string body) => body.Replace("\r\n", "\n").Replace('\r', '\n');

    private static string Newline(string text) => text.Contains("\r\n") ? "\r\n" : "\n";

    // ---- types ------------------------------------------------------------------------------------

    private sealed record Field(string Name, string Type);

    private sealed record Ctx(
        string AppName,
        string AppLower,
        string Module,
        string Entity,
        string Plural,
        bool HasUserId,
        bool HasCreatedAt,
        bool HasUpdatedAt,
        List<Field> Scalars,
        List<Field> Complex);
}
