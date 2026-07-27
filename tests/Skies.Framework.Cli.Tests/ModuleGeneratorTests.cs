using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class ModuleGeneratorTests
{
    [Fact]
    public void Generates_a_module_and_wires_it_into_the_registry()
    {
        var root = NewProject("Shop.Api");

        var code = ModuleGenerator.Generate(root, "Orders");

        Assert.Equal(0, code);
        var module = File.ReadAllText(Path.Combine(root, "Modules", "Orders", "OrdersModule.cs"));
        Assert.Contains("namespace Shop.Api.Modules.Orders;", module);
        Assert.Contains("[Module]", module);
        Assert.Contains("public static class OrdersModule", module);
        Assert.Contains("AddServices(IServiceCollection services, IConfiguration configuration)", module);
        Assert.Contains("Map(IEndpointRouteBuilder app)", module);

        // Wired on both sides of the explicit registry, not into Program.cs.
        var registry = File.ReadAllText(Path.Combine(root, "Modules", "Modules.cs"));
        Assert.Contains("using Shop.Api.Modules.Orders;", registry);
        Assert.Contains("OrdersModule.AddServices(services, configuration);", registry);
        Assert.Contains("OrdersModule.Map(app);", registry);
    }

    [Fact]
    public void Refuses_to_overwrite_an_existing_module()
    {
        var root = NewProject("Shop.Api");

        Assert.Equal(0, ModuleGenerator.Generate(root, "Orders"));
        Assert.Equal(1, ModuleGenerator.Generate(root, "Orders"));
    }

    private static string NewProject(string name)
    {
        var root = Directory.CreateTempSubdirectory("skies-module-test").FullName;
        File.WriteAllText(Path.Combine(root, name + ".csproj"), "<Project />");
        File.WriteAllText(Path.Combine(root, "Program.cs"), "var app = WebApplication.Create();\n\napp.Run();\n");

        // The canonical registry the starter ships (one existing module, so MapModules has an anchor line).
        Directory.CreateDirectory(Path.Combine(root, "Modules"));
        var registry =
            "namespace " + name + ".Modules;\n\n" +
            "public static class Modules\n{\n" +
            "    public static IServiceCollection AddModules(this IServiceCollection services, IConfiguration configuration)\n" +
            "    {\n" +
            "        HealthModule.AddServices(services, configuration);\n" +
            "        return services;\n" +
            "    }\n\n" +
            "    public static void MapModules(this WebApplication app)\n" +
            "    {\n" +
            "        HealthModule.Map(app);\n" +
            "    }\n}\n";
        File.WriteAllText(Path.Combine(root, "Modules", "Modules.cs"), registry);
        return root;
    }
}
