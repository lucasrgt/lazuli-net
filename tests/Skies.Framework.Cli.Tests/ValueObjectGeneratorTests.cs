using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class ValueObjectGeneratorTests
{
    [Fact]
    public void Generates_an_always_valid_value_object_in_buildingblocks()
    {
        var root = NewProject("Shop.Api");

        var code = ValueObjectGenerator.Generate(root, "Email");

        Assert.Equal(0, code);
        var vo = File.ReadAllText(Path.Combine(root, "BuildingBlocks", "Email.cs"));
        Assert.Contains("namespace Shop.Api.BuildingBlocks;", vo);
        Assert.Contains("[ValueObject]", vo);
        Assert.Contains("public readonly record struct Email", vo);
        Assert.Contains("private Email(string value)", vo);
        Assert.Contains("public static Result<Email> From(string value)", vo);

        // The shape SKY0013 requires: immutable (no setter at all) and built only through From.
        Assert.DoesNotContain("set;", vo);

        // The error code is a registry constant (SKY0018) — the value object ships its own *ErrorCodes registry.
        Assert.Contains("public static class EmailErrorCodes", vo);
        Assert.Contains("public const string Required = \"email.required\";", vo);
        Assert.Contains("EmailErrorCodes.Required", vo);
    }

    [Fact]
    public void Refuses_to_overwrite_an_existing_value_object()
    {
        var root = NewProject("Shop.Api");

        Assert.Equal(0, ValueObjectGenerator.Generate(root, "Email"));
        Assert.Equal(1, ValueObjectGenerator.Generate(root, "Email"));
    }

    private static string NewProject(string name)
    {
        var root = Directory.CreateTempSubdirectory("skies-vo-test").FullName;
        File.WriteAllText(Path.Combine(root, name + ".csproj"), "<Project />");
        return root;
    }
}
