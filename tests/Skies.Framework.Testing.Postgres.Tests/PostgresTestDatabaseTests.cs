using Skies.Framework.Testing.Postgres;

namespace Skies.Framework.Testing.Postgres.Tests;

// The container-and-clone path needs Docker, so it is exercised by the pilots (the hostpoint suite runs it on
// every CI pass). What is pinned here are the statements and derivations whose regression would be silent: an
// unbounded or long-lived clone pool exhausts the server's slots, while pooling off exhausts Windows' ephemeral
// sockets in a large suite (the bounded, aggressively pruned middle is the production invariant), and a drop that
// loses FORCE or a reap that loses the clone prefix quietly restores the leak that filled a container with ~1500
// live databases and pushed the host into swap.
public class PostgresTestDatabaseTests
{
    private const string Maintenance = "Host=localhost;Port=55432;Database=postgres;Username=postgres;Password=postgres";

    [Fact]
    public void A_clone_connection_targets_the_clone_with_a_tiny_pruned_pool()
    {
        var connection = PostgresTestDatabase.IsolatedConnectionString(Maintenance, "t_abc");

        Assert.Contains("Database=t_abc", connection);
        var settings = new Npgsql.NpgsqlConnectionStringBuilder(connection);
        Assert.True(settings.Pooling);
        Assert.Equal(0, settings.MinPoolSize);
        Assert.Equal(4, settings.MaxPoolSize);
        Assert.Equal(1, settings.ConnectionIdleLifetime);
        Assert.Equal(1, settings.ConnectionPruningInterval);
    }

    [Fact]
    public void A_clone_connection_keeps_the_containers_host_and_credentials()
    {
        var connection = PostgresTestDatabase.IsolatedConnectionString(Maintenance, "t_abc");

        Assert.Contains("Port=55432", connection);
        Assert.Contains("Username=postgres", connection);
    }

    [Fact]
    public void Returning_a_store_drops_its_database_even_with_a_session_still_attached()
    {
        var statement = PostgresTestDatabase.DropStatement("t_abc");

        // Without FORCE a context disposed after its store, or a pooled socket not yet pruned, fails the drop with
        // 55006 and the database stays live — the leak, restored.
        Assert.Equal("DROP DATABASE IF EXISTS \"t_abc\" WITH (FORCE)", statement);
    }

    [Fact]
    public void The_orphan_reap_selects_this_classs_clones_and_nothing_else()
    {
        var query = PostgresTestDatabase.OrphanCloneQuery();

        // starts_with, not LIKE: the prefix ends in an underscore, which LIKE would read as a single-character
        // wildcard and so would match databases this class never created.
        Assert.Equal("SELECT datname FROM pg_database WHERE starts_with(datname, 't_')", query);
        Assert.DoesNotContain("LIKE", query, StringComparison.OrdinalIgnoreCase);
    }
}
