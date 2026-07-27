using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using System.Threading;
using Microsoft.CodeAnalysis;

namespace Skies.Framework.Doctor;

/// <summary>
/// The shared reading of a module's <b>Clockwork spec manifest</b> — the per-module
/// <c>&lt;Module&gt;.spec.toml</c> that declares each slice's acceptance obligation. It is the one place
/// that answers "which criteria does this slice owe?" so <c>SKY0030</c> (every declared criterion has an
/// <c>[AVP]</c> proof) and <c>SKY0031</c> (every slice is declared with a criterion) read the
/// manifest the one way and can never disagree on what it says.
///
/// The manifest is co-located with the module (e.g. <c>Modules/Wallets/Wallets.spec.toml</c>) and read
/// from <c>AdditionalFiles</c> — the app opts in with <c>&lt;AdditionalFiles Include="**\*.spec.toml" /&gt;</c>
/// — the same textual approach the doctor uses for <c>.ctx.md</c> and <c>*.Tests.cs</c>. The acceptance
/// obligation lives in this manifest, so a slice's spec is a reviewable file beside it, not source noise.
///
/// A focused hand-rolled reader parses exactly this known shape (no TOML NuGet dependency, which a Roslyn
/// analyzer cannot easily carry):
/// <code>
/// module = "Wallets"
/// [slices.Withdraw]
/// criteria = ["idempotency-key-honored"]
/// [slices.Deposit]
/// criteria = ["idempotency-key-honored", "no-overdraw"]
/// </code>
/// </summary>
internal sealed class SpecManifest
{
    /// <summary>The file-name suffix every spec manifest carries (<c>&lt;Module&gt;.spec.toml</c>).</summary>
    public const string Suffix = ".spec.toml";

    private readonly Dictionary<string, ImmutableArray<string>> _criteriaBySlice;

    private SpecManifest(string module, string path, Dictionary<string, ImmutableArray<string>> criteriaBySlice)
    {
        Module = module;
        Path = path;
        _criteriaBySlice = criteriaBySlice;
    }

    /// <summary>The module the manifest declares (the <c>module = "..."</c> line), or the file name's stem.</summary>
    public string Module { get; }

    /// <summary>The manifest's file path, for reporting the file name in a diagnostic message.</summary>
    public string Path { get; }

    /// <summary>The slice names the manifest declares a <c>[slices.&lt;Name&gt;]</c> table for.</summary>
    public IEnumerable<string> Slices => _criteriaBySlice.Keys;

    /// <summary>The criteria declared for <paramref name="slice"/>; empty when the slice is absent or lists none.</summary>
    public ImmutableArray<string> CriteriaFor(string slice) =>
        _criteriaBySlice.TryGetValue(slice, out var ids) ? ids : ImmutableArray<string>.Empty;

    /// <summary>Whether the manifest declares a <c>[slices.&lt;Name&gt;]</c> table for <paramref name="slice"/>.</summary>
    public bool Declares(string slice) => _criteriaBySlice.ContainsKey(slice);

    /// <summary>
    /// Read every <c>&lt;Module&gt;.spec.toml</c> in <paramref name="files"/>, keyed by the declared module name.
    /// A manifest with no <c>module = "..."</c> line falls back to the file-name stem (<c>Wallets.spec.toml</c>
    /// → <c>Wallets</c>), so a co-located manifest is always reachable by its module.
    /// </summary>
    public static Dictionary<string, SpecManifest> ReadAll(ImmutableArray<AdditionalText> files, CancellationToken ct)
    {
        var byModule = new Dictionary<string, SpecManifest>(StringComparer.Ordinal);
        foreach (var file in files)
        {
            if (!file.Path.EndsWith(Suffix, StringComparison.OrdinalIgnoreCase))
                continue;
            var text = file.GetText(ct)?.ToString();
            if (text is null)
                continue;
            var manifest = Parse(text, file.Path);
            byModule[manifest.Module] = manifest;   // last one wins; module names are unique per workspace
        }

        return byModule;
    }

    /// <summary>
    /// Parse one manifest's text into its module name and slice→criteria map. The reader walks the known
    /// shape line by line: a top-level <c>module = "..."</c>, then <c>[slices.&lt;Name&gt;]</c> tables each
    /// carrying a <c>criteria = ["a", "b"]</c> array. Blank lines, comments (<c>#</c>) and unknown keys are
    /// ignored, so the manifest can grow human notes without breaking the doctor.
    /// </summary>
    public static SpecManifest Parse(string text, string path)
    {
        string? declaredModule = null;
        var criteriaBySlice = new Dictionary<string, ImmutableArray<string>>(StringComparer.Ordinal);
        string? currentSlice = null;

        foreach (var raw in text.Replace("\r\n", "\n").Split('\n'))
        {
            var line = StripComment(raw).Trim();
            if (line.Length == 0)
                continue;

            if (line.StartsWith("[", StringComparison.Ordinal) && line.EndsWith("]", StringComparison.Ordinal))
            {
                var table = line.Substring(1, line.Length - 2).Trim();
                currentSlice = table.StartsWith("slices.", StringComparison.Ordinal)
                    ? table.Substring("slices.".Length).Trim()
                    : null;
                if (currentSlice is { Length: > 0 } && !criteriaBySlice.ContainsKey(currentSlice))
                    criteriaBySlice[currentSlice] = ImmutableArray<string>.Empty;   // a table with no criteria key still declares the slice
                continue;
            }

            var eq = line.IndexOf('=');
            if (eq < 0)
                continue;
            var key = line.Substring(0, eq).Trim();
            var value = line.Substring(eq + 1).Trim();

            if (currentSlice is null && key == "module")
                declaredModule = Unquote(value);
            else if (currentSlice is { Length: > 0 } && key == "criteria")
                criteriaBySlice[currentSlice] = ParseStringArray(value);
        }

        var module = declaredModule is { Length: > 0 }
            ? declaredModule
            : System.IO.Path.GetFileName(path).Replace(Suffix, string.Empty);
        return new SpecManifest(module, path, criteriaBySlice);
    }

    // Drop a trailing "# comment", but only when the '#' sits outside a quoted string (ids never contain '#'
    // in our shape, so a simple quote-aware scan is enough — no need for a full lexer).
    private static string StripComment(string line)
    {
        var inQuote = false;
        for (var i = 0; i < line.Length; i++)
        {
            if (line[i] == '"')
                inQuote = !inQuote;
            else if (line[i] == '#' && !inQuote)
                return line.Substring(0, i);
        }

        return line;
    }

    // The right-hand side of `criteria = [...]` into its string elements. Lenient by design: it pulls every
    // double-quoted token from the array body, so trailing commas and whitespace never trip the reader.
    private static ImmutableArray<string> ParseStringArray(string value)
    {
        var open = value.IndexOf('[');
        var close = value.LastIndexOf(']');
        if (open < 0 || close < open)
            return ImmutableArray<string>.Empty;

        var body = value.Substring(open + 1, close - open - 1);
        var ids = ImmutableArray.CreateBuilder<string>();
        var depth = 0;
        while (depth < body.Length)
        {
            var start = body.IndexOf('"', depth);
            if (start < 0)
                break;
            var end = body.IndexOf('"', start + 1);
            if (end < 0)
                break;
            var id = body.Substring(start + 1, end - start - 1);
            if (id.Length > 0)
                ids.Add(id);
            depth = end + 1;
        }

        return ids.ToImmutable();
    }

    // A bare TOML string value: strip the surrounding double quotes if present.
    private static string Unquote(string value) =>
        value.Length >= 2 && value[0] == '"' && value[value.Length - 1] == '"'
            ? value.Substring(1, value.Length - 2)
            : value;
}
