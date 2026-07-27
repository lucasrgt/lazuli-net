namespace Skies.Framework.Abstractions;

/// <summary>
/// Marks a class as a module's wiring root — the one place a bounded context plugs into the host. It pairs the
/// two halves of a module's composition: <c>AddServices(IServiceCollection, IConfiguration)</c> (its own DI) and
/// <c>Map(IEndpointRouteBuilder)</c> (its routes), so the module owns both and the composition root stays a thin
/// index. The doctor enforces it: <c>SKY0015</c> checks the shape (both halves are declared), and <c>SKY0016</c>
/// checks every <c>[Module]</c> is wired in the app's explicit module registry — so generating a module and
/// forgetting to register it is a build error, not a silent 404.
///
/// Like <see cref="SliceAttribute"/> and <see cref="EntityAttribute"/> it is a pure marker: there is nothing to
/// inherit and nothing happens at runtime. Crucially it is <strong>not</strong> a discovery mechanism — Skies
/// reflects over nothing; the registry is explicit code you can read. Remove the <c>Skies.Framework.Doctor</c> analyzer
/// and it becomes inert decoration, the app compiling and running unchanged (Law 2).
/// </summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class ModuleAttribute : Attribute;
