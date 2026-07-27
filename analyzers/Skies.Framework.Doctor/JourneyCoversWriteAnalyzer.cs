using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Text;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0010 — a <c>[Journey]</c> proves a write slice, and nothing else. A
/// <c>[Journey(typeof(X), …)]</c> whose <c>X</c> is a mechanically recognized read is rejected: its only
/// consumer is <c>SKY0008</c>, which tracks write slices, so the marker would otherwise be inert metadata.
///
/// Together with <c>SKY0008</c> (every write slice has its happy + sad journeys) this makes the relation
/// bidirectional. Journeys live in test files excluded from the app build, so — like
/// <c>SKY0008</c> — they are read from <c>AdditionalFiles</c> and matched textually.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class JourneyCoversWriteAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for a journey that covers a read slice.</summary>
    public const string DiagnosticId = "SKY0010";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "A journey must cover a write slice",
        messageFormat: "[Journey] covers read slice '{0}' — drop [Journey] and keep a plain [E2E] flow test; "
                     + "write-depth obligations are derived from the slice shape",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "A [Journey] is the SKY0008-tracked proof of a write slice; one pointing at a read is "
                   + "inert. Use a plain [E2E] flow test for a voluntary read traversal.",
        customTags: WellKnownDiagnosticTags.CompilationEnd);

    // Mirrors SKY0008's journey grammar: [Journey(typeof(Slice), JourneyPath.Happy|Sad)] — the covers: prefix
    // and the enum qualifier are optional, and the slice may be written qualified (last segment is the name).
    private static readonly Regex JourneyPattern = new(
        @"Journey\s*\(\s*(?:covers\s*:\s*)?typeof\s*\(\s*(?<slice>[\w.]+)\s*\)\s*,\s*(?:\w+\s*\.\s*)?(?:Happy|Sad)\b",
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
        var writes = new ConcurrentBag<string>();

        context.RegisterSyntaxNodeAction(syntax =>
        {
            var cls = (ClassDeclarationSyntax)syntax.Node;
            if (VerificationDepthPolicy.RequiresJourneys(cls))
                writes.Add(cls.Identifier.Text);
        }, SyntaxKind.ClassDeclaration);

        context.RegisterCompilationEndAction(end =>
        {
            var writeSet = new HashSet<string>(writes);
            foreach (var file in end.Options.AdditionalFiles)
            {
                var source = file.GetText(end.CancellationToken);
                var text = source?.ToString();
                if (text is null)
                    continue;

                foreach (Match match in JourneyPattern.Matches(text))
                {
                    var group = match.Groups["slice"];
                    var dot = group.Value.LastIndexOf('.');
                    var slice = dot >= 0 ? group.Value.Substring(dot + 1) : group.Value;
                    if (writeSet.Contains(slice))
                        continue;

                    var span = new TextSpan(group.Index, group.Length);
                    var location = Location.Create(file.Path, span, source!.Lines.GetLinePositionSpan(span));
                    end.ReportDiagnostic(Diagnostic.Create(Rule, location, slice));
                }
            }
        });
    }
}
