using System.Text;
using Assay.Net;

namespace Skies.Framework.Cli;

/// <summary>
/// Renders a slice's co-located AVP proof file (<c>&lt;Slice&gt;.Avp.Tests.cs</c>) — the proof half of
/// correct-by-construction. Each declared criterion gets a test that carries
/// <c>[AVP(typeof(Slice), "id")]</c> (the anchor
/// SKY0030 scans) and is already wired to <c>Runner.Run</c> with the right archetype; the subject factory
/// throws until the author boots the real endpoint, so the scaffold is RED BY DESIGN — the obligation and
/// its proof ship in the same change-set, and green only ever means the behavior actually held.
/// </summary>
internal static class AvpProofScaffold
{
    /// <summary>Render the proof file for <paramref name="slice"/> covering <paramref name="criteria"/>.</summary>
    /// <param name="testNamespace">The app's test namespace (<c>&lt;App&gt;.Tests</c>).</param>
    /// <param name="appNamespace">The production app namespace containing the subject type.</param>
    /// <param name="module">The module the slice belongs to.</param>
    /// <param name="slice">The slice name.</param>
    /// <param name="criteria">The criterion ids the manifest declares for the slice.</param>
    public static string Render(
        string testNamespace, string appNamespace, string module, string slice, IReadOnlyList<string> criteria)
    {
        var bindings = criteria
            .Select(id => (Id: id, Binding: AvpBinding.For(id).FirstOrDefault()))
            .ToList();

        var file = new StringBuilder();
        file.AppendLine("using Assay.Net;");
        file.AppendLine($"using {appNamespace}.Modules.{module};");
        if (bindings.Any(b => b.Binding is not null))
            file.AppendLine("using Assay.Net.Archetypes;");
        file.AppendLine();
        file.AppendLine($"namespace {testNamespace}.Modules.{module};");
        file.AppendLine();
        file.AppendLine($$"""
            /// <summary>
            /// The AVP proofs of the criteria {{module}}.spec.toml declares for {{slice}} — Doctor 2 of the Clockwork
            /// gate. Each proof runs the shared Assay.Net verifier against the REAL slice; the scaffold is RED by
            /// design until the subject factory boots the real endpoint. Calibrate before trusting a green: the same
            /// verifier must FAIL an escape variant (the sample-app's Withdraw.Avp.Tests.cs shows the full shape).
            /// </summary>
            public class {{slice}}AvpProof
            {
                private static readonly ProtocolCatalog AvpCatalog = Catalog.LoadDefault();
            """);

        foreach (var (id, binding) in bindings)
            file.AppendLine(binding is null ? UnboundProof(slice, id) : BoundProof(slice, id, binding));

        foreach (var subject in bindings.Where(b => b.Binding is not null).Select(b => b.Binding!.SubjectType.Name).Distinct())
            file.AppendLine(SubjectFactory(slice, subject));

        file.AppendLine("}");
        return file.ToString();
    }

    private static string BoundProof(string slice, string id, ArchetypeBinding binding)
    {
        var variants = AvpBinding.For(id).Skip(1).Select(b => b.ArchetypeType.Name).ToList();
        var variantNote = variants.Count == 0
            ? string.Empty
            : $"\n    // Variant archetype{(variants.Count == 1 ? string.Empty : "s")} for this criterion: {string.Join(", ", variants)}.";
        return $$"""

                [AVP(typeof({{slice}}), "{{id}}")]{{variantNote}}
                [Integration]
                [Fact]
                public async Task {{slice}}_holds_{{Safe(id)}}()
                {
                    var verdict = await Runner.Run(
                        AvpCatalog, new {{binding.ArchetypeType.Name}}(), "{{slice}}", Real{{binding.SubjectType.Name}}());

                    var result = verdict.Results.First(r => r.CriterionId == "{{id}}");
                    Assert.True(result.Status == Assay.Net.VerdictStatus.Pass, result.Reason);
                }
            """;
    }

    private static string UnboundProof(string slice, string id) => $$"""

            [AVP(typeof({{slice}}), "{{id}}")]
            [Integration]
            [Fact]
            public async Task {{slice}}_holds_{{Safe(id)}}()
            {
                // '{{id}}' has no executable archetype in this Assay.Net version: an off-catalog criterion
                // (ADR 0002 — ship your own verifier) or one this adapter cannot run yet. Verify it here;
                // a proof that cannot fail must never ship, so this stays red until the check is real.
                await Task.CompletedTask;
                Assert.Fail("write the verifier for '{{id}}' — red until the criterion is actually checked");
            }
        """;

    private static string SubjectFactory(string slice, string subjectType) => $$"""

            // Describe the REAL {{slice}} endpoint as the archetype's seam: boot the app the sample-app way
            // (WebApplication on 127.0.0.1:0 with an isolated store) and fill in the base url, route and fields.
            // The proof stays red until this factory exists — form and proof ship together, on purpose.
            private static {{subjectType}} Real{{subjectType}}() =>
                throw new NotImplementedException(
                    "boot the real {{slice}} endpoint and describe it as a {{subjectType}} " +
                    "(reference: examples/sample-app — Withdraw.Avp.Tests.cs)");
        """;

    private static string Safe(string id) => id.Replace('-', '_');
}
