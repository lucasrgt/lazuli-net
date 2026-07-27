using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Skies.Framework.Doctor;

/// <summary>
/// SKY0006 — no repository / unit-of-work abstraction. A Skies slice queries the <c>DbContext</c>
/// directly in its <c>Handle</c>; the repository / UoW / mapper-profile layer of clean architecture is
/// bloat the framework deliberately cuts. A type whose name ends in <c>Repository</c> or
/// <c>UnitOfWork</c> reintroduces that layer, so it is flagged at its declaration — delete it and read
/// the <c>DbContext</c> from the slice instead.
///
/// The check is purely syntactic (the type's name), the same trade-off as the other naming rules; it
/// fires on the abstraction's declaration, not on every reference, so the diagnostic points at the one
/// place to remove. EF Core's own <c>DbSet</c>/<c>DbContext</c> are not repositories and never match.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class NoRepositoryAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for a repository/unit-of-work type declaration.</summary>
    public const string DiagnosticId = "SKY0006";

    private static readonly DiagnosticDescriptor Rule = new(
        id: DiagnosticId,
        title: "No repository / unit-of-work abstraction",
        messageFormat: "'{0}' reintroduces a repository/unit-of-work layer — a Skies slice reads the DbContext "
                     + "directly in Handle; delete the abstraction",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Slices query the DbContext directly; the repository/UoW/mapper layer of clean architecture is "
                   + "bloat the framework cuts. A type named *Repository or *UnitOfWork reintroduces it.");

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(
            Analyze,
            SyntaxKind.ClassDeclaration,
            SyntaxKind.InterfaceDeclaration,
            SyntaxKind.RecordDeclaration,
            SyntaxKind.RecordStructDeclaration,
            SyntaxKind.StructDeclaration);
    }

    private static void Analyze(SyntaxNodeAnalysisContext context)
    {
        var decl = (TypeDeclarationSyntax)context.Node;
        var name = decl.Identifier.Text;
        if (!IsRepositoryName(name))
            return;

        context.ReportDiagnostic(Diagnostic.Create(Rule, decl.Identifier.GetLocation(), name));
    }

    // The abstraction's name: `*Repository` (UserRepository, IRepository) or `*UnitOfWork` (IUnitOfWork).
    // Names that merely contain the word elsewhere are not matched — only the suffix that names the layer.
    private static bool IsRepositoryName(string name)
    {
        var bare = name.StartsWith("I", System.StringComparison.Ordinal) && name.Length > 1 && char.IsUpper(name[1])
            ? name.Substring(1)
            : name;
        return new[] { "Repository", "UnitOfWork" }.Any(suffix =>
            bare.EndsWith(suffix, System.StringComparison.Ordinal));
    }
}
