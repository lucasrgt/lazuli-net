using System.Collections.Generic;
using System.Collections.Immutable;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0020 — a <c>[Journey]</c> must assert its post-condition, not merely run. <c>SKY0008</c> proves a
/// write slice HAS its happy + sad journeys; this proves each journey actually checks something — the
/// depth rung above existence. A happy journey asserts the observable effect; a sad journey carries at least
/// two assertion tokens so both the rejection and unchanged post-state are checked. A shallow journey is
/// theater: it exercises the path and proves too little.
///
/// Like <c>SKY0008</c>/<c>SKY0010</c>, journeys live in test files excluded from the app compilation, so this
/// reads them as <c>AdditionalFiles</c> and works textually: for each <c>[Journey(...)]</c> it brace-matches
/// the test method body and looks for an assertion token (<c>Assert</c>, FluentAssertions' <c>Should</c>, or
/// a <c>Verify</c>/<c>Expect</c>/<c>Ensure</c> helper — <c>EnsureSuccessStatusCode()</c> is a real assertion: it
/// throws on failure). The heuristic sets a structural floor; semantic adequacy remains the runtime test's job.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class JourneyAssertionAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for a journey whose body proves too little.</summary>
    public const string DiagnosticId = "SKY0020";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "A journey must assert its post-condition",
        messageFormat: "{1} journey for '{0}' has insufficient assertions — happy needs its observable effect; "
                     + "sad needs both the rejection and the unchanged post-state",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "A [Journey] that runs the path without proving its post-condition is theater. Happy needs "
                   + "an observable-effect assertion; sad needs assertions for rejection and unchanged state.",
        customTags: WellKnownDiagnosticTags.CompilationEnd);

    private static readonly DiagnosticDescriptor ShapeRule = new(
        id: "SKY0033",
        title: "Journey proof must be an isolated executable E2E test",
        messageFormat: "Journey proof for '{0}' is not valid evidence — {1}",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Each journey obligation is paid by one runner-discoverable [E2E] test method in a "
                   + "*Journey.Tests.cs file. Unit tests, stacked subjects and unexecuted methods are not evidence.",
        customTags: WellKnownDiagnosticTags.CompilationEnd);

    // An assertion token: xUnit Assert.*, FluentAssertions .Should(), a Verify/Expect helper, or an Ensure*
    // call (EnsureSuccessStatusCode throws on failure — a real assertion). Boundary on the left only, so helper
    // names that extend the token (VerifyRejected, AssertBalance) still count.
    private static readonly Regex AssertionPattern = new(@"\b(Assert|Should|Verify|Expect|Ensure)", RegexOptions.Compiled);

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule, ShapeRule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterCompilationAction(Analyze);
    }

    private static void Analyze(CompilationAnalysisContext context)
    {
        foreach (var method in JourneyProofPolicy.Read(context.Options.AdditionalFiles, context.CancellationToken))
        {
            var journey = method.Journeys[0];
            if (method.InvalidReason is not null)
            {
                var span = journey.Attribute.Span;
                var location = Location.Create(
                    method.FilePath, span, method.Source.Lines.GetLinePositionSpan(span));
                context.ReportDiagnostic(Diagnostic.Create(
                    ShapeRule, location, journey.Subject, method.InvalidReason));
                continue;
            }

            var body = method.Method.Body?.ToString() ?? method.Method.ExpressionBody?.ToString() ?? "";
            var requiredAssertions = journey.Path == "Sad" ? 2 : 1;
            if (AssertionPattern.Matches(body).Count >= requiredAssertions)
                continue;

            var assertionSpan = journey.Attribute.Span;
            var assertionLocation = Location.Create(
                method.FilePath, assertionSpan, method.Source.Lines.GetLinePositionSpan(assertionSpan));
            context.ReportDiagnostic(Diagnostic.Create(
                Rule, assertionLocation, journey.Subject, journey.Path));
        }
    }
}
