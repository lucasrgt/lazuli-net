using Sample.Api.Modules.Wallets;

namespace Sample.Api.Modules;

/// <summary>The module registry — the one explicit list of the app's modules, wired on both sides: AddModules
/// registers each module's services, MapModules its routes. Adding a module is a line in each (skies g appends
/// them). Explicit on purpose — Skies discovers nothing by reflection; the doctor (SKY0015) checks every
/// [Module] appears here, so a module can't be silently left unwired.</summary>
public static class Modules
{
    public static IServiceCollection AddModules(this IServiceCollection services, IConfiguration configuration)
    {
        WalletsModule.AddServices(services, configuration);
        return services;
    }

    public static void MapModules(this WebApplication app)
    {
        WalletsModule.Map(app);
    }
}
