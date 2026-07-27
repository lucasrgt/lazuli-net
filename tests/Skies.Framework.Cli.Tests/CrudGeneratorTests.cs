using Skies.Framework.Cli;
using Assay.Net;

namespace Skies.Framework.Cli.Tests;

public class CrudGeneratorTests
{
    [Fact]
    public void Crud_is_born_with_a_subject_bound_acceptance_proof_for_every_slice()
    {
        var solution = Directory.CreateTempSubdirectory("skies-crud-generator-test").FullName;
        var api = Directory.CreateDirectory(Path.Combine(solution, "src", "Shop.Api")).FullName;
        var tests = Directory.CreateDirectory(Path.Combine(solution, "tests", "Shop.Tests")).FullName;
        var module = Directory.CreateDirectory(Path.Combine(api, "Modules", "Inventory")).FullName;
        File.WriteAllText(Path.Combine(api, "Shop.Api.csproj"), Project());
        File.WriteAllText(Path.Combine(tests, "Shop.Tests.csproj"), Project());
        File.WriteAllText(Path.Combine(module, "InventoryModule.cs"), "public static class InventoryModule { }");
        File.WriteAllText(Path.Combine(module, "Item.cs"), """
            public class Item : ITenantScoped
            {
                public Guid Id { get; set; }
                public Guid OrgId { get; set; }
                public string Name { get; set; } = "";
            }
            """);

        Assert.Equal(0, CrudGenerator.Generate(api, "Inventory", "Item"));

        var manifest = SpecManifest.Load(Path.Combine(module, "Inventory.spec.toml"));
        var expected = new Dictionary<string, string>
        {
            ["ListItem"] = "returns-stable-page",
            ["LookupItem"] = "returns-requested-resource",
            ["CreateItem"] = "persists-created-resource",
            ["UpdateItem"] = "persists-requested-change",
            ["DeleteItem"] = "removes-resource",
        };
        foreach (var (slice, criterion) in expected)
        {
            Assert.Equal(new[] { criterion }, manifest.Slices[slice]);
            var proof = File.ReadAllText(Path.Combine(module, "Slices", slice + ".Tests.cs"));
            Assert.Contains($"[AVP(typeof({slice}), \"{criterion}\")]", proof);
        }

        Assert.Contains("PackageReference Include=\"Assay.Net\" Version=\"0.4.0\"",
            File.ReadAllText(Path.Combine(tests, "Shop.Tests.csproj")));
    }

    private static string Project() => """
        <Project Sdk="Microsoft.NET.Sdk">
          <ItemGroup>
          </ItemGroup>
        </Project>
        """;
}
