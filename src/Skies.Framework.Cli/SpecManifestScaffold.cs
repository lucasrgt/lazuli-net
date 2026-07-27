namespace Skies.Framework.Cli;

/// <summary>
/// The writer half of the Clockwork spec manifest (<c>&lt;Module&gt;.spec.toml</c>). Assay.Net and the doctor
/// only READ the manifest; the scaffolder is what brings a declaration into existence, so a slice can be born
/// with its acceptance obligation instead of the author remembering to add it. The writer is surgical: it
/// creates the file with the house header when absent, appends a missing <c>[slices.&lt;Name&gt;]</c> table,
/// or merges criterion ids into an existing one — it never reformats what a human already wrote.
/// </summary>
internal static class SpecManifestScaffold
{
    /// <summary>
    /// Ensure <paramref name="moduleDir"/>'s manifest declares <paramref name="slice"/> with (at least)
    /// <paramref name="criteria"/>. Returns the manifest path (created or updated).
    /// </summary>
    /// <param name="moduleDir">The module directory (<c>Modules/&lt;Module&gt;</c>) the manifest sits in.</param>
    /// <param name="module">The module name (the manifest's <c>module = "…"</c> and file stem).</param>
    /// <param name="slice">The slice to declare.</param>
    /// <param name="criteria">The criterion ids the slice must prove.</param>
    public static string EnsureDeclared(string moduleDir, string module, string slice, IReadOnlyList<string> criteria)
    {
        Directory.CreateDirectory(moduleDir);
        var path = Path.Combine(moduleDir, module + ".spec.toml");
        if (!File.Exists(path))
        {
            File.WriteAllText(path, NewManifest(module, slice, criteria));
            return path;
        }

        var lines = File.ReadAllLines(path).ToList();
        var header = lines.FindIndex(l => l.Trim() == $"[slices.{slice}]");
        if (header < 0)
        {
            if (lines.Count > 0 && lines[^1].Trim().Length > 0)
                lines.Add(string.Empty);
            lines.Add($"[slices.{slice}]");
            lines.Add(CriteriaLine(criteria));
        }
        else
        {
            MergeIntoTable(lines, header, criteria);
        }

        File.WriteAllLines(path, lines);
        return path;
    }

    // Merge ids into the table's criteria array (union, declaration order preserved), or insert the line
    // when the table declares none yet.
    private static void MergeIntoTable(List<string> lines, int header, IReadOnlyList<string> criteria)
    {
        var end = lines.FindIndex(header + 1, l => l.TrimStart().StartsWith('['));
        if (end < 0)
            end = lines.Count;

        for (var i = header + 1; i < end; i++)
        {
            var trimmed = lines[i].TrimStart();
            if (!trimmed.StartsWith("criteria", StringComparison.Ordinal) || !trimmed.Contains('='))
                continue;
            var existing = ExistingIds(lines[i]);
            var merged = existing.Concat(criteria.Where(c => !existing.Contains(c, StringComparer.Ordinal))).ToList();
            lines[i] = CriteriaLine(merged);
            return;
        }

        lines.Insert(header + 1, CriteriaLine(criteria));
    }

    // The double-quoted ids already on the criteria line, in order.
    private static List<string> ExistingIds(string line)
    {
        var ids = new List<string>();
        var open = line.IndexOf('[');
        if (open < 0)
            return ids;
        foreach (var piece in line[(open + 1)..].Split(','))
        {
            var id = piece.Trim().Trim(']', ' ', '\t').Trim('"');
            if (id.Length > 0)
                ids.Add(id);
        }

        return ids;
    }

    private static string CriteriaLine(IReadOnlyList<string> criteria) =>
        "criteria = [" + string.Join(", ", criteria.Select(c => $"\"{c}\"")) + "]";

    private static string NewManifest(string module, string slice, IReadOnlyList<string> criteria) =>
        $"""
        # {module} — Clockwork spec manifest
        #
        # The per-module acceptance spec. Each slice's `criteria` array lists the AVP catalog ids it must be
        # PROVEN against; the doctor reads this file (as an AdditionalFile) to close the spec<->code bijection
        # both ways: SKY0031 fails any [Slice] not declared here with >=1 criterion, SKY0030 fails a
        # declared criterion that no [AVP(typeof(Slice), "id")] proof verifies. The obligation lives here, not on an inline
        # attribute, so the spec is a reviewable file beside the module.

        module = "{module}"

        [slices.{slice}]
        {CriteriaLine(criteria)}

        """;
}
