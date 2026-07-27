using Microsoft.EntityFrameworkCore;

namespace Sample.Api;

/// <summary>The app's platform layer — its cross-cutting infrastructure, composed so <c>Program.cs</c> stays a
/// thin index. The sample's only platform concern is its store (an in-memory DbContext for the demo); a real app
/// adds a concern per file (<c>Platform/Security.cs</c>, …) as a partial of this class. <c>AddPlatform</c> is the
/// conventional name for an app's platform wiring, alongside the framework's <c>AddSkies</c> and the module
/// registry's <c>AddModules</c>.</summary>
public static partial class Platform
{
    /// <summary>Register the demo store — in-memory, so the sample runs with no database. A real app swaps the
    /// provider here (and splits this into <c>Platform/Persistence.cs</c> once there is more than one concern).</summary>
    public static IServiceCollection AddPlatform(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<AppDb>(o => o.UseInMemoryDatabase("sample"));
        services.AddIdempotency();
        return services;
    }
}
