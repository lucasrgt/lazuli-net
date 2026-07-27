using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class ErrorCodeScaffoldTests
{
    [Fact]
    public void Creates_the_registry_when_absent()
    {
        var dir = NewModuleDir();

        ErrorCodeScaffold.EnsureModuleCode(dir, "Shop.Api", "Orders", "IdRequired", "id.required", "The id is required.");

        var registry = File.ReadAllText(Path.Combine(dir, "OrdersErrorCodes.cs"));
        Assert.Contains("namespace Shop.Api.Modules.Orders;", registry);
        Assert.Contains("public static class OrdersErrorCodes", registry);
        Assert.Contains("public const string IdRequired = \"id.required\";", registry);
    }

    [Fact]
    public void Appends_a_new_constant_to_an_existing_registry()
    {
        var dir = NewModuleDir();
        ErrorCodeScaffold.EnsureModuleCode(dir, "Shop.Api", "Orders", "IdRequired", "id.required", "The id is required.");

        ErrorCodeScaffold.EnsureModuleCode(dir, "Shop.Api", "Orders", "OrderNotFound", "order.not_found", "No order for the id.");

        var registry = File.ReadAllText(Path.Combine(dir, "OrdersErrorCodes.cs"));
        Assert.Contains("public const string IdRequired = \"id.required\";", registry);
        Assert.Contains("public const string OrderNotFound = \"order.not_found\";", registry);
    }

    [Fact]
    public void Is_idempotent_for_a_constant_already_present()
    {
        var dir = NewModuleDir();
        ErrorCodeScaffold.EnsureModuleCode(dir, "Shop.Api", "Orders", "IdRequired", "id.required", "The id is required.");

        ErrorCodeScaffold.EnsureModuleCode(dir, "Shop.Api", "Orders", "IdRequired", "id.required", "The id is required.");

        var registry = File.ReadAllText(Path.Combine(dir, "OrdersErrorCodes.cs"));
        var occurrences = registry.Split("public const string IdRequired").Length - 1;
        Assert.Equal(1, occurrences);
    }

    private static string NewModuleDir() => Directory.CreateTempSubdirectory("skies-errorcodes-test").FullName;
}
