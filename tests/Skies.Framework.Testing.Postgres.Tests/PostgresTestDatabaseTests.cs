using Skies.Framework.Testing.Postgres;

namespace Skies.Framework.Testing.Postgres.Tests;

// The container-and-clone path needs Docker, so it is exercised by the pilots (the hostpoint suite runs it on
// every CI pass). What is pinned here is the connection-string derivation — the part whose regression would be
// silent: an unbounded or long-lived clone pool exhausts the server's slots, while pooling off exhausts Windows'
// ephemeral sockets in a large suite. The bounded, aggressively pruned middle is the production invariant.
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
}
