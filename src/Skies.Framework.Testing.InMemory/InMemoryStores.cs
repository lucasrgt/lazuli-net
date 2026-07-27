using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Skies.Framework.Testing;

/// <summary>
/// The in-memory fast path for <c>SkiesWebTest&lt;TProgram&gt;</c>'s <c>SwapStores</c> hook.
/// It lives in its own package on purpose: the base test class holds no database opinion, so a
/// run against a real database (e.g. Testcontainers Postgres) never pulls the in-memory provider
/// in — you reference this package only when you want the fast path.
/// </summary>
public static class InMemoryStores
{
    /// <summary>
    /// Replace <typeparamref name="TContext"/>'s registration with a fresh in-memory store unique to
    /// this test instance, so its data never bleeds into another test. Call it from <c>SwapStores</c>
    /// for a fast, isolated test; for a real database, skip this and register that provider instead.
    /// </summary>
    /// <typeparam name="TContext">The module's database context to isolate.</typeparam>
    /// <param name="services">The booted application's service collection.</param>
    public static IServiceCollection UseIsolatedInMemory<TContext>(this IServiceCollection services)
        where TContext : DbContext
    {
        // Name the store once, here — not inside the options lambda, which runs per scope. The startup
        // seed and each request must share one store, or the seed lands somewhere the request never
        // reads (a silent 404). The Guid keeps this test instance isolated from every other.
        var store = $"{typeof(TContext).Name}-{Guid.NewGuid()}";
        // Drop the real registration completely before adding the in-memory one. Removing only
        // DbContextOptions<TContext> is not enough on EF Core 9+: AddDbContext also registers the provider's
        // option-config as IDbContextOptionsConfiguration<TContext>, and if the app uses a relational
        // provider (e.g. Npgsql) that config survives — leaving two providers registered, which EF rejects
        // ("Only a single database provider can be registered"). Clear both, then add InMemory.
        services.RemoveAll<DbContextOptions<TContext>>();
        services.RemoveAll<IDbContextOptionsConfiguration<TContext>>();
        services.AddDbContext<TContext>(options => options.UseInMemoryDatabase(store));
        return services;
    }
}
