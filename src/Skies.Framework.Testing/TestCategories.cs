using Xunit.Abstractions;
using Xunit.Sdk;

namespace Skies.Framework.Testing;

// The closed catalog of test kinds. It is framework vocabulary, not app code: a category means
// the same thing in every Skies app, the doctor reads the same attribute to require coverage, and
// `dotnet test --filter Category=<kind>` selects a layer. Each attribute maps to the xUnit trait
// Category=<name> through its discoverer, so the attribute on the test is the single signal.

/// <summary>A fast, isolated test with no real infrastructure. Runs on every build.</summary>
[TraitDiscoverer("Skies.Framework.Testing.UnitDiscoverer", "Skies.Framework.Testing")]
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class UnitAttribute : Attribute, ITraitAttribute;

/// <summary>A test that exercises real infrastructure (database, HTTP). Runs on demand.</summary>
[TraitDiscoverer("Skies.Framework.Testing.IntegrationDiscoverer", "Skies.Framework.Testing")]
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class IntegrationAttribute : Attribute, ITraitAttribute;

/// <summary>A cross-module journey test against the booted application.</summary>
[TraitDiscoverer("Skies.Framework.Testing.E2EDiscoverer", "Skies.Framework.Testing")]
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class E2EAttribute : Attribute, ITraitAttribute;

/// <summary>Maps <see cref="UnitAttribute"/> to the xUnit trait <c>Category=Unit</c>.</summary>
public sealed class UnitDiscoverer : ITraitDiscoverer
{
    /// <inheritdoc />
    public IEnumerable<KeyValuePair<string, string>> GetTraits(IAttributeInfo traitAttribute)
    {
        yield return new KeyValuePair<string, string>("Category", "Unit");
    }
}

/// <summary>Maps <see cref="IntegrationAttribute"/> to the xUnit trait <c>Category=Integration</c>.</summary>
public sealed class IntegrationDiscoverer : ITraitDiscoverer
{
    /// <inheritdoc />
    public IEnumerable<KeyValuePair<string, string>> GetTraits(IAttributeInfo traitAttribute)
    {
        yield return new KeyValuePair<string, string>("Category", "Integration");
    }
}

/// <summary>Maps <see cref="E2EAttribute"/> to the xUnit trait <c>Category=E2E</c>.</summary>
public sealed class E2EDiscoverer : ITraitDiscoverer
{
    /// <inheritdoc />
    public IEnumerable<KeyValuePair<string, string>> GetTraits(IAttributeInfo traitAttribute)
    {
        yield return new KeyValuePair<string, string>("Category", "E2E");
    }
}
