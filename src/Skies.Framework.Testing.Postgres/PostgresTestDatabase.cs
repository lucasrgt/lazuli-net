using System.Collections.Concurrent;
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
    private readonly ConcurrentDictionary<string, string> _keyedDatabases = new();
    private bool _ready;
    private string _maintenanceConnection = "";

    // A template clone is serialized (via _gate) and is one-time setup, not a query under an SLA — but under a full
    // suite's worth of concurrent test databases the file_copy checkpoint can momentarily exceed Npgsql's 30s
    // default and flake the clone (observed: a 33s clone tripping the timeout). Let the client wait instead;
    // generous yet bounded, so a genuine hang still surfaces. A retry is the wrong tool — a client-side timeout
    // does not cancel the server-side CREATE DATABASE, so retrying would launch a second concurrent clone and make
    // the contention worse.
    private const int SetupCommandTimeoutSeconds = 300;
    private const int CloneMaximumPoolSize = 4;
    private const int ClonePoolLifetimeSeconds = 1;

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
    /// A fresh store's connection string. With a <paramref name="storeKey"/>, repeated calls share one
    /// database (two contexts, same data — simulating two requests); without one, each call is its own
    /// isolated database. Synchronous on purpose: test constructors and factory hooks are synchronous, and
    /// the await-worthy work (container boot + template migration) happens once per run.
    /// </summary>
    public string CreateDatabase(string? storeKey = null) =>
        CreateDatabaseAsync(storeKey).GetAwaiter().GetResult();

    /// <summary>The async twin of <see cref="CreateDatabase"/>, for async fixtures.</summary>
    public async Task<string> CreateDatabaseAsync(string? storeKey = null)
    {
        await EnsureReadyAsync().ConfigureAwait(false);
        var database = storeKey is null
            ? await CloneTemplateAsync().ConfigureAwait(false)
            : _keyedDatabases.TryGetValue(storeKey, out var existing)
                ? existing
                : _keyedDatabases.GetOrAdd(storeKey, await CloneTemplateAsync().ConfigureAwait(false));
        return ConnectionFor(database);
    }

    /// <summary>Stop and reap the container. Test hosts also reap it via Testcontainers' Ryuk if the
    /// process exits without disposing.</summary>
    public async ValueTask DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        await _container.DisposeAsync().ConfigureAwait(false);
        _gate.Dispose();
    }

    private async Task<string> CloneTemplateAsync()
    {
        var name = "t_" + Guid.NewGuid().ToString("N");
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
        return name;
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
