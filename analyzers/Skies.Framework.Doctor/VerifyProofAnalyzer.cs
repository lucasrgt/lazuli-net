using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0030 — a criterion a module's <c>&lt;Module&gt;.spec.toml</c> (the Clockwork spec manifest) declares for
/// a slice must have a matching AVP proof: somewhere in the compilation or its test files there is an
/// <c>[AVP(typeof(Slice), "id")]</c> verification for the same subject and criterion id. This couples the static doctor to the runtime
/// verifier (AVP / Assay.Net): the framework refuses to build a slice whose manifest declares an acceptance
/// criterion it never proves. A declared criterion with no proof is the bridge's <em>gap</em>.
///
/// The acceptance obligation lives in the manifest (read via <see cref="SpecManifest"/>); AVP proofs live in
/// test files excluded from the app's compilation, so the
/// analyzer reads both the manifests and the proofs as <c>AdditionalFiles</c> (and scans the compilation for
/// in-source <c>[AVP]</c>), matching subject × criterion textually — the same trade-off as <c>SKY0008</c>. Detection is by
/// attribute name, so the framework takes no dependency on the AVP package and the relation stays one-way
/// (framework knows AVP, never the reverse). The analyzer enforces only the structural bijection
/// slice↔manifest↔<c>[AVP]</c>. A proof always names its subject, so one feature can never borrow another
/// feature's proof. Validating an id against the AVP catalog is the runtime's job, not the
/// doctor's.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class VerifyProofAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for a manifest-declared criterion with no matching <c>[AVP]</c> proof.</summary>
    public const string DiagnosticId = "SKY0030";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Manifest criterion must have an AVP proof",
        messageFormat: "criterion '{0}' is declared for slice '{1}' in {2} but has no "
                     + "[AVP(typeof({1}), \"{0}\")] proof; "
                     + "add an AVP verification for it",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "A criterion declared for a slice in its module's <Module>.spec.toml states that the code "
                   + "must be proven against an AVP acceptance criterion; the build fails until a subject-bound "
                   + "[AVP(typeof(Slice), \"id\")] verification exists.",
        customTags: WellKnownDiagnosticTags.CompilationEnd);

    // Matches [AVP(typeof(Slice), "criterion-id")] in a test file, optionally namespace-qualified.
    private static readonly Regex AvpProofPattern = new(
        "\\bAVP(?:Attribute)?\\s*\\(\\s*typeof\\s*\\(\\s*(?:global::)?(?:\\w+\\.)*(?<subject>\\w+)\\s*\\)"
        + "\\s*,\\s*\"(?<id>[^\"]+)\"",
        RegexOptions.Compiled);

    private static readonly Regex ModuleNamespacePattern = new(
        "namespace\\s+[\\w.]+\\.Modules\\.(?<module>\\w+)",
        RegexOptions.Compiled);

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
        // Where each (module, slice) class is declared, so a gap can be reported on the slice it belongs to;
        // and the in-source [AVP] proofs, so a proof beside the slice counts as well as one in a test file.
        var sliceLocations = new ConcurrentDictionary<(string Module, string Slice), Location>();
        var proven = new ConcurrentBag<(string Module, string Subject, string Criterion)>();

        context.RegisterSyntaxNodeAction(syntax =>
        {
            var cls = (ClassDeclarationSyntax)syntax.Node;
            if (!VerificationDepthPolicy.IsSlice(cls))
                return;
            var module = ModuleNaming.ModuleOf(cls);
            if (module is not null)
                sliceLocations.TryAdd((module, cls.Identifier.Text), cls.Identifier.GetLocation());
        }, SyntaxKind.ClassDeclaration);

        context.RegisterSyntaxNodeAction(syntax =>
        {
            var attribute = (AttributeSyntax)syntax.Node;
            if (IsAvp(attribute))
            {
                var proof = SubjectCriterion(attribute);
                var owner = attribute.FirstAncestorOrSelf<ClassDeclarationSyntax>();
                var module = owner is null ? null : ModuleNaming.ModuleOf(owner);
                if (proof is not null && module is not null)
                    proven.Add((module, proof.Value.Subject, proof.Value.Criterion));
            }
        }, SyntaxKind.Attribute);

        context.RegisterCompilationEndAction(end =>
        {
            var manifests = SpecManifest.ReadAll(end.Options.AdditionalFiles, end.CancellationToken);
            if (manifests.Count == 0)
                return;

            var provenObligations = new HashSet<(string Module, string Subject, string Criterion)>(proven);
            foreach (var file in end.Options.AdditionalFiles)
            {
                if (file.Path.EndsWith(SpecManifest.Suffix, System.StringComparison.OrdinalIgnoreCase))
                    continue;   // a manifest is not a proof file
                var text = file.GetText(end.CancellationToken)?.ToString();
                if (text is null)
                    continue;
                var module = ModuleNamespacePattern.Match(text).Groups["module"].Value;
                if (module.Length == 0)
                    continue;
                foreach (Match match in AvpProofPattern.Matches(text))
                    provenObligations.Add((module, match.Groups["subject"].Value, match.Groups["id"].Value));
            }

            foreach (var manifest in manifests.Values)
                foreach (var slice in manifest.Slices)
                    foreach (var criterion in manifest.CriteriaFor(slice))
                        if (!provenObligations.Contains((manifest.Module, slice, criterion)))
                            end.ReportDiagnostic(Diagnostic.Create(
                                Rule,
                                Location(sliceLocations, manifest.Module, slice),
                                criterion, slice, System.IO.Path.GetFileName(manifest.Path)));
        });
    }

    // The slice's own class identifier when the analyzer saw it; otherwise no location — the manifest itself
    // is an AdditionalFile and cannot host a source location, so a gap for a slice with no class in this
    // compilation (e.g. a manifest ahead of its code) reports file-less, the same as a project-level finding.
    private static Location Location(
        ConcurrentDictionary<(string, string), Location> sliceLocations, string module, string slice) =>
        sliceLocations.TryGetValue((module, slice), out var location) ? location : Microsoft.CodeAnalysis.Location.None;

    /// <summary>Whether the attribute's written name is <c>AVP</c> (with or without the <c>Attribute</c> suffix,
    /// possibly namespace-qualified) — a syntactic match needing no symbol reference.</summary>
    private static bool IsAvp(AttributeSyntax attribute)
    {
        var name = attribute.Name.ToString();
        return name == "AVP" || name == "AVPAttribute"
            || name.EndsWith(".AVP") || name.EndsWith(".AVPAttribute");
    }

    /// <summary>The subject type and criterion literal carried by the canonical AVP constructor.</summary>
    private static (string Subject, string Criterion)? SubjectCriterion(AttributeSyntax attribute)
    {
        var arguments = attribute.ArgumentList?.Arguments;
        if (arguments is null || arguments.Value.Count < 2
            || arguments.Value[0].Expression is not TypeOfExpressionSyntax subject
            || arguments.Value[1].Expression is not LiteralExpressionSyntax criterion
            || !criterion.IsKind(SyntaxKind.StringLiteralExpression))
            return null;

        var name = subject.Type switch
        {
            IdentifierNameSyntax identifier => identifier.Identifier.ValueText,
            QualifiedNameSyntax qualified => qualified.Right.Identifier.ValueText,
            AliasQualifiedNameSyntax alias => alias.Name.Identifier.ValueText,
            _ => subject.Type.ToString().Split('.').Last(),
        };
        return (name, criterion.Token.ValueText);
    }
}
