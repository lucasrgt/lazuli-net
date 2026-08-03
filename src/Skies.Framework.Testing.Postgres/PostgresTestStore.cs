namespace Skies.Framework.Testing.Postgres;

/// <summary>
/// A leased test database: the connection string a test runs against, plus the lifetime that gives it back.
/// Disposing the lease drops the database, which is what holds a suite's live database count at its peak
/// concurrency instead of its total test count. A clone is a physical copy of the migrated template, so a suite
/// that cuts one or two per test and never returns them leaves hundreds behind in the shared container — enough
/// to swell the Docker VM until the host starts killing processes. Obtain one from
/// <see cref="PostgresTestDatabase.CreateStore"/>.
/// </summary>
/// <example>
/// <code>
/// await using var store = TestDatabase.NewStore();
/// await using var db = new AppDb(OptionsFor(store.ConnectionString));
/// </code>
/// </example>
public sealed class PostgresTestStore : IAsyncDisposable
{
    private readonly PostgresTestDatabase _owner;
    private readonly string _database;
    private readonly string? _storeKey;
    private int _released;

    internal PostgresTestStore(PostgresTestDatabase owner, string database, string? storeKey, string connectionString)
    {
        _owner = owner;
        _database = database;
        _storeKey = storeKey;
        ConnectionString = connectionString;
    }

    /// <summary>The connection string for this store's database, valid until the lease is returned.</summary>
    public string ConnectionString { get; }

    /// <summary>
    /// Give the database back. An unkeyed store is dropped here; a keyed one is dropped once its last outstanding
    /// lease is returned, so contexts sharing a key keep reading each other's writes for as long as any of them
    /// lives. Disposing twice is a no-op, so a lease may be disposed defensively.
    /// </summary>
    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _released, 1) != 0)
            return;

        await _owner.ReleaseAsync(_database, _storeKey, ConnectionString).ConfigureAwait(false);
    }
}
