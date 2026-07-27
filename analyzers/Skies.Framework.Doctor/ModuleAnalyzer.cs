using System.Collections.Concurrent;
using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Operations;

namespace Skies.Framework.Doctor;

/// <summary>
/// The <c>[Module]</c> convention — a module's wiring root owns both halves of its composition and is wired in
/// the app's explicit registry. Two rules:
///
/// <list type="bullet">
/// <item><description><c>SKY0015</c> (shape) — a <c>[Module]</c> is a <c>static</c> class declaring a public
/// static <c>AddServices(IServiceCollection, IConfiguration)</c> (its own DI, even if empty) and a public static
/// <c>Map(IEndpointRouteBuilder)</c> (its routes).</description></item>
/// <item><description><c>SKY0016</c> (registration) — every <c>[Module]</c>'s <c>AddServices</c> and <c>Map</c>
/// are actually called somewhere in the compilation (i.e. in the registry's <c>AddModules</c> / <c>MapModules</c>),
/// so generating a module and forgetting to register it is a build error, not a silent 404. This reflects over
/// nothing at runtime — it is a compile-time reachability check.</description></item>
/// </list>
///
/// The rule matches the <c>[Module]</c> attribute by simple name, so a project does not need to reference
/// Skies.Framework.Abstractions for the doctor to enforce the shape.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class ModuleAnalyzer : DiagnosticAnalyzer
{
    /// <summary>The identifier reported for a <c>[Module]</c> that does not own both halves of its wiring.</summary>
    public const string ShapeDiagnosticId = "SKY0015";

    /// <summary>The identifier reported for a <c>[Module]</c> that is never wired in the registry.</summary>
    public const string RegistrationDiagnosticId = "SKY0016";

    private static readonly DiagnosticDescriptor ShapeRule = new(
        id: ShapeDiagnosticId,
        title: "Module must own both halves of its wiring",
        messageFormat: "Module '{0}' {1}",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "A [Module] is a static class that declares a public static AddServices (its own DI) and a "
                   + "public static Map (its routes), so the module owns both halves and the composition root "
                   + "stays a thin index.");

    private static readonly DiagnosticDescriptor RegistrationRule = new(
        id: RegistrationDiagnosticId,
        title: "Module must be wired in the registry",
        messageFormat: "Module '{0}' {1}",
        category: "Skies.Framework.Convention",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true,
        description: "Every [Module]'s AddServices and Map must be called in the explicit module registry "
                   + "(AddModules / MapModules), so a module is never silently left unregistered.",
        customTags: WellKnownDiagnosticTags.CompilationEnd);

    /// <inheritdoc />
    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
        ImmutableArray.Create(ShapeRule, RegistrationRule);

    /// <inheritdoc />
    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();

        // Shape is a per-class check; registration needs the whole compilation (is each module actually called?).
        context.RegisterSyntaxNodeAction(AnalyzeShape, SyntaxKind.ClassDeclaration);
        context.RegisterCompilationStartAction(AnalyzeRegistration);
    }

    private static void AnalyzeShape(SyntaxNodeAnalysisContext context)
    {
        var cls = (ClassDeclarationSyntax)context.Node;
        if (!IsModule(cls))
            return;

        var name = cls.Identifier.Text;
        var at = cls.Identifier.GetLocation();

        if (!cls.Modifiers.Any(SyntaxKind.StaticKeyword))
            Report(context, at, name, "must be a static class — it is a wiring root, not an instance");

        if (!HasPublicStaticMethod(cls, "AddServices"))
            Report(context, at, name, "must declare a public static AddServices(IServiceCollection, IConfiguration) "
                                    + "for its own DI (an empty body is fine — the seam is uniform)");

        if (!HasPublicStaticMethod(cls, "Map"))
            Report(context, at, name, "must declare a public static Map(IEndpointRouteBuilder) for its routes");
    }

    // Registration: every [Module]'s AddServices and Map must be invoked somewhere in the compilation — i.e. it
    // is wired in the registry. A module that is never called is unreachable; flag it on its declaration.
    private static void AnalyzeRegistration(CompilationStartAnalysisContext context)
    {
        var modules = new ConcurrentDictionary<INamedTypeSymbol, Location>(SymbolEqualityComparer.Default);
        var addServicesCalled = new ConcurrentDictionary<INamedTypeSymbol, byte>(SymbolEqualityComparer.Default);
        var mapCalled = new ConcurrentDictionary<INamedTypeSymbol, byte>(SymbolEqualityComparer.Default);

        context.RegisterSymbolAction(symbolContext =>
        {
            var type = (INamedTypeSymbol)symbolContext.Symbol;
            if (HasModuleAttribute(type) && type.Locations.FirstOrDefault() is { } location)
                modules.TryAdd(type, location);
        }, SymbolKind.NamedType);

        context.RegisterOperationAction(opContext =>
        {
            var method = ((IInvocationOperation)opContext.Operation).TargetMethod;
            if (method.ContainingType is not { } container || !HasModuleAttribute(container))
                return;
            if (method.Name == "AddServices")
                addServicesCalled.TryAdd(container, 0);
            else if (method.Name == "Map")
                mapCalled.TryAdd(container, 0);
        }, OperationKind.Invocation);

        context.RegisterCompilationEndAction(endContext =>
        {
            foreach (var module in modules)
            {
                // Only flag a method that exists but is never wired; a missing method is the shape rule's job
                // (SKY0015), so the two rules never double-report the same module.
                if (HasPublicStaticMethod(module.Key, "AddServices") && !addServicesCalled.ContainsKey(module.Key))
                    endContext.ReportDiagnostic(Diagnostic.Create(RegistrationRule, module.Value, module.Key.Name,
                        "is not registered — its AddServices is never called; wire it in the module registry (AddModules)"));
                if (HasPublicStaticMethod(module.Key, "Map") && !mapCalled.ContainsKey(module.Key))
                    endContext.ReportDiagnostic(Diagnostic.Create(RegistrationRule, module.Value, module.Key.Name,
                        "is not mapped — its Map is never called; wire it in the module registry (MapModules)"));
            }
        });
    }

    private static bool HasPublicStaticMethod(INamedTypeSymbol type, string name) =>
        type.GetMembers(name).OfType<IMethodSymbol>()
            .Any(m => m.IsStatic && m.DeclaredAccessibility == Accessibility.Public);

    private static bool HasPublicStaticMethod(ClassDeclarationSyntax cls, string name) =>
        cls.Members.OfType<MethodDeclarationSyntax>()
            .Any(m => m.Identifier.Text == name
                   && m.Modifiers.Any(SyntaxKind.PublicKeyword)
                   && m.Modifiers.Any(SyntaxKind.StaticKeyword));

    private static bool IsModule(ClassDeclarationSyntax cls) =>
        cls.AttributeLists.SelectMany(list => list.Attributes).Select(attr => attr.Name.ToString())
            .Any(n => n is "Module" or "ModuleAttribute"
                   || n.EndsWith(".Module") || n.EndsWith(".ModuleAttribute"));

    private static bool HasModuleAttribute(INamedTypeSymbol type) =>
        type.GetAttributes().Any(a => a.AttributeClass?.Name is "Module" or "ModuleAttribute");

    private static void Report(SyntaxNodeAnalysisContext context, Location location, string name, string problem) =>
        context.ReportDiagnostic(Diagnostic.Create(ShapeRule, location, name, problem));
}
