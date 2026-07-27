using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class EntityGeneratorTests
{
    [Fact]
    public void Generates_a_rich_entity_in_the_canonical_shape()
    {
        var root = NewProject("Shop.Api");

        var code = EntityGenerator.Generate(root, "Orders", "Order");

        Assert.Equal(0, code);
        var entity = File.ReadAllText(Path.Combine(root, "Modules", "Orders", "Order.cs"));
        Assert.Contains("namespace Shop.Api.Modules.Orders;", entity);
        Assert.Contains("[Entity]", entity);
        Assert.Contains("public class Order", entity);
        Assert.Contains("public Guid Id { get; private set; }", entity);
        Assert.Contains("private Order() { }", entity);
        Assert.Contains("public static Result<Order> Open(Guid id)", entity);
        Assert.Contains("private Result<Order> EnsureValid()", entity);

        // The shape SKY0014 requires: nothing is publicly settable, construction is encapsulated.
        Assert.DoesNotContain("{ get; set; }", entity);

        // The scaffolded invariant uses a registry constant (SKY0018), and the module's registry is created with it.
        Assert.Contains("OrdersErrorCodes.IdRequired", entity);
        var registry = File.ReadAllText(Path.Combine(root, "Modules", "Orders", "OrdersErrorCodes.cs"));
        Assert.Contains("public const string IdRequired = \"id.required\";", registry);
    }

    [Fact]
    public void Refuses_to_overwrite_an_existing_entity()
    {
        var root = NewProject("Shop.Api");

        Assert.Equal(0, EntityGenerator.Generate(root, "Orders", "Order"));
        Assert.Equal(1, EntityGenerator.Generate(root, "Orders", "Order"));
    }

    private static string NewProject(string name)
    {
        var root = Directory.CreateTempSubdirectory("skies-entity-test").FullName;
        File.WriteAllText(Path.Combine(root, name + ".csproj"), "<Project />");
        return root;
    }
}
