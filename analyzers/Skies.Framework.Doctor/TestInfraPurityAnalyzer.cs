using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0011 — tests live in <c>src/</c>, not in the test-runner project. A test method (carrying
/// <c>[Fact]</c>/<c>[Theory]</c> or a Skies category like <c>[Unit]</c>/<c>[Integration]</c>/<c>[E2E]</c>/
/// <c>[Journey]</c>) must be authored under a <c>src/</c> directory — a unit test co-located next to its
/// slice, or a journey under <c>src/.../Journeys</c>. The test project (<c>tests/&lt;App&gt;.Tests</c>) is
/// for <em>infrastructure only</em> (the WebApplicationFactory, the database harness, shared bootstrap), so a
/// test method authored there is the convention drifting — the doctor turns it into a build error.
///
/// The rule matches the attributes by simple name, so a project needs no reference to xUnit or
/// Skies.Framework.Abstractions for the doctor to enforce it. It fires only on files outside <c>src/</c>, so the
/// co-located tests the runner compiles from <c>src/</c> are untouched.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class TestInfraPurityAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for a test authored in the test-infrastructure project.</summary>
    public const string DiagnosticId = "SKY0011";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "Tests live in src/, not in the test-infrastructure project",
        messageFormat: "Test '{0}' is authored in the test project; tests live in src/ "
                     + "(a unit test next to its slice, a journey in src/.../Journeys). The test project is infrastructure only.",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Test methods ([Fact]/[Theory]/[Unit]/[Integration]/[E2E]/[Journey]) belong in src/, "
                   + "co-located with the code they exercise. The tests/<App>.Tests project holds only test "
                   + "infrastructure (WebApplicationFactory, database harness, shared helpers).");

    private static readonly string[] TestAttributes =
    {
        "Fact", "Theory", "Unit", "Integration", "E2E", "Journey",
    };

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(AnalyzeMethod, SyntaxKind.MethodDeclaration);
    }

    private static void AnalyzeMethod(SyntaxNodeAnalysisContext context)
    {
        var method = (MethodDeclarationSyntax)context.Node;
        if (!HasTestAttribute(method))
            return;

        if (IsUnderSrc(context.Node.SyntaxTree.FilePath))
            return;

        context.ReportDiagnostic(Diagnostic.Create(Rule, method.Identifier.GetLocation(), method.Identifier.Text));
    }

    private static bool HasTestAttribute(MethodDeclarationSyntax method) =>
        method.AttributeLists
            .SelectMany(list => list.Attributes)
            .Select(attr => SimpleName(attr.Name.ToString()))
            .Any(name => TestAttributes.Contains(name));

    // The attribute name without namespace qualification or the "Attribute" suffix: "Xunit.FactAttribute" -> "Fact".
    private static string SimpleName(string name)
    {
        var lastDot = name.LastIndexOf('.');
        if (lastDot >= 0)
            name = name.Substring(lastDot + 1);
        return name.EndsWith("Attribute") ? name.Substring(0, name.Length - "Attribute".Length) : name;
    }

    // A file is "in src/" when some path segment is exactly "src" — the Skies convention root for production
    // code and its co-located tests. Files in tests/<App>.Tests have no such segment.
    private static bool IsUnderSrc(string? filePath)
    {
        if (string.IsNullOrEmpty(filePath))
            return true;   // unknown origin (e.g. generated) — don't flag

        var normalized = filePath!.Replace('\\', '/');
        return normalized.Contains("/src/") || normalized.StartsWith("src/");
    }
}
