using System.Collections.Concurrent;
using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0031 — every <c>[Slice]</c> must declare at least one acceptance
/// criterion in its module's <c>&lt;Module&gt;.spec.toml</c> (the Clockwork spec manifest): a
/// <c>[slices.&lt;Name&gt;]</c> table with a non-empty <c>criteria</c> array. It is the reverse of
/// <c>SKY0030</c> on the other axis — SKY0030 forces a declared criterion to have an <c>[AVP]</c> proof
/// (criterion ⟹ proof); this forces every behaviour to declare a criterion in the first place
/// (slice ⟹ criterion). Together they close the spec-driven bridge in both directions, so a slice can never
/// ship proving nothing at the AVP layer.
///
/// The obligation lives in the manifest (read via <see cref="SpecManifest"/>), so a slice's acceptance spec is
/// a reviewable file beside it rather than
/// source noise. It is one rung finer than
/// <c>SKY0008</c>'s end-to-end journeys — a journey proves the path runs; the AVP criterion proves a named
/// property holds. Write shape controls the additional happy/sad journey depth.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class SliceCriterionAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for a slice not declared in its module's spec manifest.</summary>
    public const string DiagnosticId = "SKY0031";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Slice must declare a criterion in its spec manifest",
        messageFormat: "slice '{0}' declares no acceptance criterion in {1}; add a "
                     + "[slices.{0}] table with a non-empty criteria array (proven by a matching "
                     + "[AVP(typeof({0}), \"id\")])",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Every slice must name at least one AVP acceptance criterion in its module's "
                   + "<Module>.spec.toml — the reverse of SKY0030 — so no feature can ship proving nothing. "
                   + "Write slices additionally owe the deeper journeys enforced by SKY0008.",
        customTags: WellKnownDiagnosticTags.CompilationEnd);

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterCompilationStartAction(OnStart);
    }

    private static void OnStart(CompilationStartAnalysisContext context)
    {
        // The slices collected during syntax analysis, each remembered with its module and a
        // location to report on; the manifest is only available (as AdditionalFiles) at compilation end.
        var slices = new ConcurrentBag<(string Module, string Slice, Location Location)>();

        context.RegisterSyntaxNodeAction(node =>
        {
            var cls = (ClassDeclarationSyntax)node.Node;
            if (!VerificationDepthPolicy.IsSlice(cls))
                return;
            var module = ModuleNaming.ModuleOf(cls);
            if (module is not null)
                slices.Add((module, cls.Identifier.Text, cls.Identifier.GetLocation()));
        }, SyntaxKind.ClassDeclaration);

        context.RegisterCompilationEndAction(end =>
        {
            if (slices.IsEmpty)
                return;

            var manifests = SpecManifest.ReadAll(end.Options.AdditionalFiles, end.CancellationToken);

            foreach (var (module, slice, location) in slices)
            {
                var expected = module + SpecManifest.Suffix;
                var declared = manifests.TryGetValue(module, out var manifest)
                    && !manifest.CriteriaFor(slice).IsEmpty;
                if (!declared)
                    end.ReportDiagnostic(Diagnostic.Create(Rule, location, slice, expected));
            }
        });
    }
}
