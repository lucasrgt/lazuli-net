using Npgsql;
using Testcontainers.PostgreSql;

namespace Skies.Framework.Testing.Postgres;

/// <summary>
/// The test suite's real database — one Postgres container (Testcontainers) shared by every test, so unique
/// constraints, value converters, SQL translation, and any engine-specific behaviour are exercised for real
/// (an in-memory provider masks all of those). The container starts once on first use and the app's
/// <c>migrateTemplate</c> delegate migrates a single template database; each store a test asks for is a
/// database <em>cloned</em> from that template (<c>CREATE DATABASE … TEMPLATE</c>) — the per-test isolation
/// the in-memory store gives, on the real engine, without re-migrating per test. A <em>keyed</em> store lets
/// two contexts share one database (the "data written by one request is read by the next" pattern). Each clone
/// receives a tiny, aggressively pruned pool: this reuses sockets within a test without retaining hundreds of
/// clone pools or exhausting Windows' ephemeral ports across a large suite. Graduated from the hostpoint pilot's
/// <c>TestDatabase</c>.
///
/// <para>Ask for stores through <see cref="CreateStore"/> and dispose them: a clone is a physical copy of the
/// template, so a suite that cuts one or two per test and never gives them back leaves hundreds of live databases
/// in the shared container, and the Docker VM grows with them until the host starts killing processes. A returned
/// lease drops its database, which pins the live count to peak concurrency rather than total test count.
/// <see cref="CreateDatabase"/> hands out a bare connection string with no lifetime attached and therefore cannot
/// reclaim anything; it remains for callers that predate the lease, and the class warns on the console once a run
/// accumulates enough un-returned clones to matter.</para>
/// </summary>
/// <example>
/// The app wraps one instance in its own static accessor:
/// <code>
/// public static class TestDatabase
/// {
///     private static readonly PostgresTestDatabase Db = new(
///         image: "postgis/postgis:16-3.4",
///         migrateTemplate: async cs =>
///         {
///             await using var ctx = new AppDb(OptionsFor(cs));
///             await ctx.Database.MigrateAsync();
///         });
///
///     public static AppDb NewContext(string? storeKey = null) =>
///         new(OptionsFor(Db.CreateDatabase(storeKey)));
/// }
/// </code>
/// </example>
public sealed class PostgresTestDatabase : IAsyncDisposable
{
    private readonly PostgreSqlContainer _container;
    private readonly Func<string, Task> _migrateTemplate;
    private readonly string _template;
    private readonly SemaphoreSlim _gate = new(1, 1);
    // Keyed resolution takes its own gate: cloning already holds _gate, and SemaphoreSlim is not reentrant. It also
    // has to be a lock rather than a ConcurrentDictionary — GetOrAdd evaluates its value eagerly, so two tests
    // racing on a fresh key both cloned and the loser's database was discarded still live, leaking silently.
    private readonly SemaphoreSlim _keyedGate = new(1, 1);
    private readonly Dictionary<string, KeyedStore> _keyedDatabases = new(StringComparer.Ordinal);
    private bool _ready;
    private string _maintenanceConnection = "";
    private int _liveClones;
    private int _cloneCeiling = LiveCloneCeiling;

    // A template clone is serialized (via _gate) and is one-time setup, not a query under an SLA — but under a full
    // suite's worth of concurrent test databases the file_copy checkpoint can momentarily exceed Npgsql's 30s
    // default and flake the clone (observed: a 33s clone tripping the timeout). Let the client wait instead;
    // generous yet bounded, so a genuine hang still surfaces. A retry is the wrong tool — a client-side timeout
    // does not cancel the server-side CREATE DATABASE, so retrying would launch a second concurrent clone and make
    // the contention worse.
    private const int SetupCommandTimeoutSeconds = 300;
    private const int CloneMaximumPoolSize = 4;
    private const int ClonePoolLifetimeSeconds = 1;

    // Every clone this class cuts carries the prefix, which is what makes leftovers identifiable: both the
    // startup reap and a human reading pg_database can tell a test clone from a real database.
    internal const string ClonePrefix = "t_";

    // Peak concurrency of a large suite is tens of databases, not hundreds, so crossing this many live clones means
    // stores are not being returned. The count is a warning rather than a throw: failing a suite that ran green
    // yesterday would be the wrong trade, but staying silent is how a run reaches four figures and takes the host
    // down with it. The threshold doubles after each warning so a leaking run keeps reporting without flooding.
    private const int LiveCloneCeiling = 128;

    /// <summary>Declare the suite's database. Nothing starts until the first store is asked for.</summary>
    /// <param name="migrateTemplate">Migrates the template database the clones are cut from; receives its
    /// connection string (typically <c>ctx.Database.MigrateAsync()</c> over the app's context).</param>
    /// <param name="image">The Postgres image — override for extensions (e.g. <c>postgis/postgis:16-3.4</c>).</param>
    /// <param name="template">The template database's name; override only if it collides with a real one.</param>
    public PostgresTestDatabase(
        Func<string, Task> migrateTemplate,
        string image = "postgres:17-alpine",
        string template = "skies_template")
    {
        _migrateTemplate = migrateTemplate;
        _template = template;
        _container = new PostgreSqlBuilder(image)
            .WithDatabase("postgres")
            .WithUsername("postgres")
            .WithPassword("postgres")
            // A throwaway test database needs no crash durability, so the server runs without it. This is the
            // lever that matters at scale: CREATE DATABASE … TEMPLATE physically copies the template, and a suite
            // that cuts hundreds of clones otherwise drowns the disk in WAL — 200-second checkpoints until the
            // clone command times out (the failure this fixes). fsync/synchronous_commit/full_page_writes off
            // makes every checkpoint cheap; a wide max_wal_size stops the checkpoints firing every few seconds.
            .WithCommand(
                "-c", "fsync=off",
                "-c", "synchronous_commit=off",
                "-c", "full_page_writes=off",
                "-c", "max_wal_size=2GB")
            .Build();
    }

    /// <summary>
    /// A fresh store, held for as long as the returned lease lives. With a <paramref name="storeKey"/>, calls
    /// sharing that key share one database (two contexts, same data — simulating two requests); without one, each
    /// call is its own isolated database. Dispose the lease when the test ends — that is what gives the database
    /// back. Synchronous on purpose: test constructors and factory hooks are synchronous, and the await-worthy
    /// work (container boot + template migration) happens once per run.
    /// </summary>
    public PostgresTestStore CreateStore(string? storeKey = null) =>
        CreateStoreAsync(storeKey).GetAwaiter().GetResult();

    /// <summary>The async twin of <see cref="CreateStore"/>, for async fixtures.</summary>
    public async Task<PostgresTestStore> CreateStoreAsync(string? storeKey = null)
    {
        var database = await ResolveDatabaseAsync(storeKey).ConfigureAwait(false);
        return new PostgresTestStore(this, database, storeKey, ConnectionFor(database));
    }

    /// <summary>
    /// A fresh store's connection string, with no lifetime attached: the database lives until the container stops.
    /// Prefer <see cref="CreateStore"/>, whose lease drops the database when the test ends. This overload remains
    /// for callers written before leases existed, and a suite still on it accumulates one live database per call.
    /// </summary>
    public string CreateDatabase(string? storeKey = null) =>
        CreateDatabaseAsync(storeKey).GetAwaiter().GetResult();

    /// <summary>The async twin of <see cref="CreateDatabase"/>, for async fixtures.</summary>
    public async Task<string> CreateDatabaseAsync(string? storeKey = null)
    {
        var database = await ResolveDatabaseAsync(storeKey).ConfigureAwait(false);
        return ConnectionFor(database);
    }

    private async Task<string> ResolveDatabaseAsync(string? storeKey)
    {
        await EnsureReadyAsync().ConfigureAwait(false);
        return storeKey is null
            ? await CloneTemplateAsync().ConfigureAwait(false)
            : await LeaseKeyedAsync(storeKey).ConfigureAwait(false);
    }

    // A keyed database is pinned by every caller that resolved the key, so it survives until the last one returns
    // it. A CreateDatabase caller pins it without ever releasing — deliberately: the bare connection string it got
    // has no lifetime, so dropping underneath it would be worse than keeping the database alive.
    private async Task<string> LeaseKeyedAsync(string storeKey)
    {
        await _keyedGate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_keyedDatabases.TryGetValue(storeKey, out var existing))
            {
                existing.Leases++;
                return existing.Database;
            }

            var database = await CloneTemplateAsync().ConfigureAwait(false);
            _keyedDatabases[storeKey] = new KeyedStore(database);
            return database;
        }
        finally
        {
            _keyedGate.Release();
        }
    }

    internal async Task ReleaseAsync(string database, string? storeKey, string connectionString)
    {
        if (storeKey is not null)
        {
            await _keyedGate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (!_keyedDatabases.TryGetValue(storeKey, out var keyed) || --keyed.Leases > 0)
                    return;

                _keyedDatabases.Remove(storeKey);
            }
            finally
            {
                _keyedGate.Release();
            }
        }

        await DropAsync(database, connectionString).ConfigureAwait(false);
    }

    private async Task DropAsync(string database, string connectionString)
    {
        // Retire the clone's client-side pool first: FORCE would terminate those backends anyway, but a pool left
        // registered for a dropped database can still hand a broken connection to a later caller.
        NpgsqlConnection.ClearPool(new NpgsqlConnection(connectionString));

        // Unlike cloning, dropping needs no serialization — distinct databases do not contend, and putting teardown
        // behind the clone gate would only add latency to the tests still asking for stores.
        await using var admin = new NpgsqlConnection(_maintenanceConnection);
        await admin.OpenAsync().ConfigureAwait(false);
        await using var cmd = admin.CreateCommand();
#pragma warning disable CA2100 // the name is this class's own GUID-suffixed clone, not user input
        cmd.CommandText = DropStatement(database);
#pragma warning restore CA2100
        cmd.CommandTimeout = SetupCommandTimeoutSeconds;
        await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
        Interlocked.Decrement(ref _liveClones);
    }

    // FORCE (PostgreSQL 13+) terminates whatever session is still attached. A test that leaves a connection open —
    // a context disposed after its store, a pooled socket not yet pruned — would otherwise fail the drop with
    // 55006 and put the leak straight back.
    internal static string DropStatement(string database) =>
        $"DROP DATABASE IF EXISTS \"{database}\" WITH (FORCE)";

    // Clones left by a previous run only exist when the container outlives it (an opted-in reused container, or a
    // host killed mid-suite). Reaping them is the same self-healing the template's drop-then-create already does,
    // and it is what stops consecutive runs from stacking.
    internal static string OrphanCloneQuery() =>
        $"SELECT datname FROM pg_database WHERE starts_with(datname, '{ClonePrefix}')";

    private void CountClone()
    {
        var live = Interlocked.Increment(ref _liveClones);
        var ceiling = Volatile.Read(ref _cloneCeiling);
        if (live < ceiling || Interlocked.CompareExchange(ref _cloneCeiling, ceiling * 2, ceiling) != ceiling)
            return;

        Console.Error.WriteLine(
            $"Skies.Framework.Testing.Postgres: {live} test databases are live in the container and none have been "
            + "returned recently. Each is a physical copy of the migrated template, so a suite at this rate can "
            + "exhaust the Docker VM's memory and destabilise the host. Take stores from CreateStore(...) and "
            + "dispose the lease when the test ends; CreateDatabase(...) cannot reclaim anything.");
    }

    private sealed class KeyedStore(string database)
    {
        public string Database { get; } = database;

        public int Leases { get; set; } = 1;
    }

    /// <summary>Stop and reap the container. Test hosts also reap it via Testcontainers' Ryuk if the
    /// process exits without disposing.</summary>
    public async ValueTask DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        await _container.DisposeAsync().ConfigureAwait(false);
        _gate.Dispose();
        _keyedGate.Dispose();
    }

    private async Task<string> CloneTemplateAsync()
    {
        var name = ClonePrefix + Guid.NewGuid().ToString("N");
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            await using var admin = new NpgsqlConnection(_maintenanceConnection);
            await admin.OpenAsync().ConfigureAwait(false);
            await using var cmd = admin.CreateCommand();
            // CA2100: not user input — `name` is a fresh GUID and the template name is ctor-fixed; CREATE
            // DATABASE is DDL and cannot be parameterized.
#pragma warning disable CA2100
            // STRATEGY file_copy: copy the template's files directly instead of the PG15+ default (wal_log),
            // which journals every block of the copied database. At hundreds of clones a run, wal_log buries the
            // disk in WAL — the checkpoint thrash that times the clone out; file_copy (the pre-PG15 behaviour)
            // skips it, and pairs with the durability-off server flags set on the container.
            cmd.CommandText = $"CREATE DATABASE \"{name}\" TEMPLATE \"{_template}\" STRATEGY file_copy";
#pragma warning restore CA2100
            cmd.CommandTimeout = SetupCommandTimeoutSeconds;
            await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
        CountClone();
        return name;
    }

    private async Task ReapOrphanClonesAsync()
    {
        await using var admin = new NpgsqlConnection(_maintenanceConnection);
        await admin.OpenAsync().ConfigureAwait(false);

        var orphans = new List<string>();
        await using (var read = admin.CreateCommand())
        {
#pragma warning disable CA2100 // a constant query over the ctor-fixed clone prefix, with no caller input
            read.CommandText = OrphanCloneQuery();
#pragma warning restore CA2100
            await using var rows = await read.ExecuteReaderAsync().ConfigureAwait(false);
            while (await rows.ReadAsync().ConfigureAwait(false))
                orphans.Add(rows.GetString(0));
        }

        foreach (var orphan in orphans)
        {
            await using var drop = admin.CreateCommand();
#pragma warning disable CA2100 // the name came from pg_database and matches this class's own clone prefix
            drop.CommandText = DropStatement(orphan);
#pragma warning restore CA2100
            drop.CommandTimeout = SetupCommandTimeoutSeconds;
            await drop.ExecuteNonQueryAsync().ConfigureAwait(false);
        }
    }

    private async Task EnsureReadyAsync()
    {
        if (_ready)
            return;

        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_ready)
                return;

            await _container.StartAsync().ConfigureAwait(false);
            _maintenanceConnection = _container.GetConnectionString();   // targets the 'postgres' maintenance db

            // Drop-then-create: a previous run that failed mid-migration (a pending-model-changes error, a
            // killed test host) leaves an orphan template behind, and a bare CREATE would fail every run after
            // with 42P04 — the suite would never self-heal. Recreating is cheap (the migration runs once per
            // container) and makes EnsureReady idempotent.
            await using (var admin = new NpgsqlConnection(_maintenanceConnection))
            {
                await admin.OpenAsync().ConfigureAwait(false);
                await using var create = admin.CreateCommand();
#pragma warning disable CA2100 // the template name is ctor-fixed, not user input
                create.CommandText = $"DROP DATABASE IF EXISTS \"{_template}\"; CREATE DATABASE \"{_template}\"";
#pragma warning restore CA2100
                create.CommandTimeout = SetupCommandTimeoutSeconds;
                await create.ExecuteNonQueryAsync().ConfigureAwait(false);
            }

            await ReapOrphanClonesAsync().ConfigureAwait(false);
            await _migrateTemplate(ConnectionFor(_template)).ConfigureAwait(false);

            NpgsqlConnection.ClearAllPools();   // release the template's connections so it can be cloned
            _ready = true;
        }
        finally
        {
            _gate.Release();
        }
    }

    // A unique pool exists per clone because the database is part of Npgsql's pool key. Keeping pooling off avoids
    // server-slot retention but creates a fresh TCP socket for nearly every EF command; a large Windows suite then
    // exhausts the finite ephemeral-port range while closed sockets remain in TIME_WAIT. A tiny pool reuses sockets
    // during one test, while the one-second idle/pruning policy reaps pools fast enough that old clones do not retain
    // server sessions. The template pool is explicitly cleared before the first clone, so it never blocks TEMPLATE.
    internal static string IsolatedConnectionString(string maintenanceConnection, string database) =>
        new NpgsqlConnectionStringBuilder(maintenanceConnection)
        {
            Database = database,
            Pooling = true,
            MinPoolSize = 0,
            MaxPoolSize = CloneMaximumPoolSize,
            ConnectionIdleLifetime = ClonePoolLifetimeSeconds,
            ConnectionPruningInterval = ClonePoolLifetimeSeconds,
        }.ConnectionString;

    private string ConnectionFor(string database) => IsolatedConnectionString(_maintenanceConnection, database);
}
