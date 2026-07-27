using System.Collections.Generic;
using System.Collections.Immutable;
using System.IO;
using System.Linq;
using System.Threading;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Text;

namespace Skies.Framework.Doctor;

/// <summary>Parses the isolated executable test method that may pay one write-journey obligation.</summary>
internal static class JourneyProofPolicy
{
    internal static IEnumerable<JourneyMethod> Read(ImmutableArray<AdditionalText> files, CancellationToken ct)
    {
        foreach (var file in files)
        {
            var source = file.GetText(ct);
            if (source is null || !file.Path.EndsWith(".cs", System.StringComparison.OrdinalIgnoreCase))
                continue;

            var root = CSharpSyntaxTree.ParseText(source.ToString(), cancellationToken: ct).GetRoot(ct);
            foreach (var method in root.DescendantNodes().OfType<MethodDeclarationSyntax>())
            {
                var attributes = method.AttributeLists.SelectMany(list => list.Attributes).ToArray();
                var journeys = attributes
                    .Where(attribute => IsAttribute(attribute, "Journey"))
                    .Select(ReadJourney)
                    .Where(journey => journey is not null)
                    .Select(journey => journey!)
                    .ToArray();
                if (journeys.Length == 0)
                    continue;

                yield return new JourneyMethod(
                    file.Path,
                    source,
                    method,
                    journeys,
                    attributes.Any(attribute => IsAttribute(attribute, "E2E")),
                    attributes.Any(attribute => IsAttribute(attribute, "Fact") || IsAttribute(attribute, "Theory")),
                    attributes.Any(attribute => IsAttribute(attribute, "Unit") || IsAttribute(attribute, "Integration")));
            }
        }
    }

    private static JourneyDeclaration? ReadJourney(AttributeSyntax attribute)
    {
        var arguments = attribute.ArgumentList?.Arguments;
        if (arguments is null || arguments.Value.Count != 2
            || arguments.Value[0].Expression is not TypeOfExpressionSyntax typeOf)
            return null;

        var path = arguments.Value[1].Expression switch
        {
            MemberAccessExpressionSyntax member => member.Name.Identifier.ValueText,
            IdentifierNameSyntax identifier => identifier.Identifier.ValueText,
            _ => "",
        };
        if (path is not ("Happy" or "Sad"))
            return null;

        var subject = typeOf.Type.ToString().Replace("global::", "").Split('.').Last();
        return new JourneyDeclaration(subject, path, attribute);
    }

    private static bool IsAttribute(AttributeSyntax attribute, string expected)
    {
        var name = attribute.Name.ToString().Replace("global::", "").Split('.').Last();
        return name == expected || name == expected + "Attribute";
    }
}

/// <summary>One method carrying journey declarations and the evidence needed to trust it.</summary>
internal sealed class JourneyMethod(
    string filePath,
    SourceText source,
    MethodDeclarationSyntax method,
    IReadOnlyList<JourneyDeclaration> journeys,
    bool hasE2E,
    bool hasTest,
    bool hasConflictingCategory)
{
    internal string FilePath { get; } = filePath;

    internal SourceText Source { get; } = source;

    internal MethodDeclarationSyntax Method { get; } = method;

    internal IReadOnlyList<JourneyDeclaration> Journeys { get; } = journeys;

    internal bool HasE2E { get; } = hasE2E;

    internal bool HasTest { get; } = hasTest;

    internal bool HasConflictingCategory { get; } = hasConflictingCategory;

    internal string? InvalidReason =>
        !Path.GetFileName(FilePath).EndsWith("Journey.Tests.cs", System.StringComparison.OrdinalIgnoreCase)
            ? "the file name must end in Journey.Tests.cs"
            : Journeys.Count != 1
                ? "one test method must prove exactly one slice and one path"
                : !HasE2E
                    ? "the method must carry [E2E]"
                    : !HasTest
                        ? "the method must carry [Fact] or [Theory] so the runner executes it"
                        : HasConflictingCategory
                            ? "an E2E journey cannot also be [Unit] or [Integration]"
                            : null;
}

/// <summary>One parsed journey declaration.</summary>
internal sealed class JourneyDeclaration(string subject, string path, AttributeSyntax attribute)
{
    internal string Subject { get; } = subject;

    internal string Path { get; } = path;

    internal AttributeSyntax Attribute { get; } = attribute;
}
