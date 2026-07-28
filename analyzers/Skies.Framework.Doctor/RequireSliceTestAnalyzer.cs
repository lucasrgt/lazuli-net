using System;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0003 — every <c>[Slice]</c> must have a co-located test. The framework's thesis is that the
/// doctor obliges tests, not the author's discipline: a slice in <c>Foo.cs</c> with no
/// <c>Foo.Tests.cs</c> or an isolated <c>FooJourney.Tests.cs</c> beside it fails the build. The test files are excluded from the app's own
/// compilation (no test dependencies ship), so the analyzer reads them as <c>AdditionalFiles</c> —
/// the app project opts in with <c>&lt;AdditionalFiles Include="**\*.Tests.cs" /&gt;</c>.
///
/// This is the structural floor: it proves a test file exists, not that the test asserts anything.
/// The category vocabulary (<c>[Unit]</c> / <c>[Integration]</c> / <c>[E2E]</c>) and coverage depth
/// are separate concerns, enforced separately.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class RequireSliceTestAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for a slice with no co-located test.</summary>
    public const string DiagnosticId = "SKY0003";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Slice must have a co-located test",
        messageFormat: "Slice '{0}' has no co-located test; add '{1}' beside it",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Every [Slice] must have a co-located <Slice>.Tests.cs or <Slice>Journey.Tests.cs. The doctor obliges the "
                   + "test to exist; a slice without one fails the build.");

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(AnalyzeClass, SyntaxKind.ClassDeclaration);
    }

    private static void AnalyzeClass(SyntaxNodeAnalysisContext context)
    {
        var cls = (ClassDeclarationSyntax)context.Node;
        if (!IsSlice(cls))
            return;

        var slicePath = cls.SyntaxTree.FilePath;
        if (string.IsNullOrEmpty(slicePath))
            return;

        var expected = Path.GetFileNameWithoutExtension(slicePath) + ".Tests.cs";
        var journey = Path.GetFileNameWithoutExtension(slicePath) + "Journey.Tests.cs";

        var hasTest = context.Options.AdditionalFiles
            .Any(file =>
            {
                var name = Path.GetFileName(file.Path);
                return string.Equals(name, expected, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(name, journey, StringComparison.OrdinalIgnoreCase);
            });

        if (!hasTest)
            context.ReportDiagnostic(Diagnostic.Create(Rule, cls.Identifier.GetLocation(), cls.Identifier.Text, expected));
    }

    // Matches [Slice] by simple name, so a project needs no reference to Skies.Framework.Abstractions for the
    // doctor to enforce the rule — the same approach as SKY0001.
    private static bool IsSlice(ClassDeclarationSyntax cls) =>
        cls.AttributeLists
            .SelectMany(list => list.Attributes)
            .Select(attr => attr.Name.ToString())
            .Any(n => n is "Slice" or "SliceAttribute"
                   || n.EndsWith(".Slice")
                   || n.EndsWith(".SliceAttribute"));
}
