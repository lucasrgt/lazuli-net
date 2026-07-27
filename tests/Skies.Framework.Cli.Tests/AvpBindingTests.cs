using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class AvpBindingTests
{
    [Fact]
    public void Discovers_the_executable_archetypes_of_the_referenced_assay()
    {
        // The whole point of reflection over a static map: whatever Assay.Net ships is what skies knows.
        Assert.NotEmpty(AvpBinding.All);
        Assert.All(AvpBinding.All, b =>
        {
            Assert.False(string.IsNullOrWhiteSpace(b.Name));
            Assert.Equal(typeof(Assay.Net.Catalog).Assembly, b.ArchetypeType.Assembly);
            Assert.Equal(typeof(Assay.Net.Catalog).Assembly, b.SubjectType.Assembly);
            Assert.NotEmpty(b.OracleIds);
        });
    }

    [Fact]
    public void The_idempotency_criterion_resolves_to_its_archetype_and_subject()
    {
        var binding = Assert.Single(AvpBinding.For("idempotency-key-honored"));

        Assert.Equal("request-idempotency", binding.Name);
        Assert.Equal("RequestIdempotency", binding.ArchetypeType.Name);
        Assert.Equal("RequestIdempotencySubject", binding.SubjectType.Name);
    }

    [Fact]
    public void An_unknown_criterion_has_no_binding()
    {
        Assert.Empty(AvpBinding.For("definitely-not-a-criterion"));
    }

    [Fact]
    public void Every_runnable_oracle_id_exists_in_the_neutral_catalog()
    {
        // The adapter binds oracles TO the catalog — an oracle for an id the catalog doesn't define would
        // mean the adapter drifted from the protocol it claims to implement.
        var catalogIds = Assay.Net.Catalog.LoadDefault()
            .Archetypes.SelectMany(a => a.Criteria).Select(c => c.Id).ToHashSet(StringComparer.Ordinal);

        Assert.All(AvpBinding.All.SelectMany(b => b.OracleIds), id => Assert.Contains(id, catalogIds));
    }
}
