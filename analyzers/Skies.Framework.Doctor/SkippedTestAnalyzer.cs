using System;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0032 — a disabled test is not evidence. It rejects xUnit <c>Fact</c>/<c>Theory</c> attributes carrying
/// <c>Skip</c>, <c>SkipWhen</c>, <c>SkipUnless</c>, or <c>Explicit</c>, both in the compilation and in co-located
/// test files supplied as AdditionalFiles. This closes the gap where <c>dotnet test</c> exits zero while a
/// required journey never ran.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class SkippedTestAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported when a test is disabled.</summary>
    public const string DiagnosticId = "SKY0032";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Tests must not be skipped",
        messageFormat: "test '{0}' can be disabled in {1}; remove Skip/SkipWhen/SkipUnless/Explicit — a test that did not run is not proof",
        category: "Skies.Framework.Testing",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Required tests and journeys must execute. xUnit treats skipped, conditional, and explicit-only "
                   + "tests as a successful run, so Skies rejects those switches at build time.",
        customTags: WellKnownDiagnosticTags.CompilationEnd);

    private static readonly Regex AdditionalFileSkip = new(
        @"(?m)^\s*\[(?:[\w.]+\.)?(?:Fact|Theory)(?:Attribute)?\s*\([^\]\r\n]*\b(?:Skip|SkipWhen|SkipUnless|Explicit)\s*=",
        RegexOptions.Compiled);

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();

        context.RegisterSyntaxNodeAction(syntax =>
        {
            var attribute = (AttributeSyntax)syntax.Node;
            if (!IsTest(attribute) || !HasSkip(attribute))
                return;
            var method = attribute.FirstAncestorOrSelf<MethodDeclarationSyntax>();
            syntax.ReportDiagnostic(Diagnostic.Create(
                Rule,
                attribute.GetLocation(),
                method?.Identifier.ValueText ?? "(unknown)",
                attribute.SyntaxTree.FilePath));
        }, SyntaxKind.Attribute);

        context.RegisterCompilationAction(compilation =>
        {
            foreach (var file in compilation.Options.AdditionalFiles)
            {
                var text = file.GetText(compilation.CancellationToken)?.ToString();
                if (text is null || !AdditionalFileSkip.IsMatch(text))
                    continue;
                compilation.ReportDiagnostic(Diagnostic.Create(
                    Rule, Location.None, Path.GetFileNameWithoutExtension(file.Path), Path.GetFileName(file.Path)));
            }
        });
    }

    private static bool IsTest(AttributeSyntax attribute)
    {
        var name = attribute.Name.ToString();
        return name is "Fact" or "FactAttribute" or "Theory" or "TheoryAttribute"
            || name.EndsWith(".Fact", StringComparison.Ordinal)
            || name.EndsWith(".FactAttribute", StringComparison.Ordinal)
            || name.EndsWith(".Theory", StringComparison.Ordinal)
            || name.EndsWith(".TheoryAttribute", StringComparison.Ordinal);
    }

    private static bool HasSkip(AttributeSyntax attribute) =>
        attribute.ArgumentList?.Arguments.Any(argument =>
            argument.NameEquals?.Name.Identifier.ValueText is "Skip" or "SkipWhen" or "SkipUnless" or "Explicit") == true;
}
