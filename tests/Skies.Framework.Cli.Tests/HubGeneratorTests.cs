using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class HubGeneratorTests
{
    [Fact]
    public void Generates_a_thin_authenticated_hub_in_the_convention_shape()
    {
        var root = NewProject("Shop.Api");

        var code = HubGenerator.Generate(root, "Messaging", "Chat");

        Assert.Equal(0, code);
        var hub = File.ReadAllText(Path.Combine(root, "Modules", "Messaging", "Realtime", "ChatHub.cs"));
        Assert.Contains("namespace Shop.Api.Modules.Messaging.Realtime;", hub);
        Assert.Contains("public sealed class ChatHub : Hub", hub);
        Assert.Contains("[Authorize]", hub);
        // Wire, not logic: the caller comes from the principal (hub has no HTTP context).
        Assert.Contains("new ClaimsCurrentUser(Context.User)", hub);
        Assert.Contains("Groups.AddToGroupAsync", hub);
    }

    [Fact]
    public void Names_the_class_with_a_single_Hub_suffix()
    {
        var root = NewProject("Shop.Api");

        HubGenerator.Generate(root, "Messaging", "Chat");

        var hub = File.ReadAllText(Path.Combine(root, "Modules", "Messaging", "Realtime", "ChatHub.cs"));
        Assert.Contains("class ChatHub", hub);
        Assert.DoesNotContain("ChatHubHub", hub);
    }

    [Fact]
    public void Refuses_to_overwrite_an_existing_hub()
    {
        var root = NewProject("Shop.Api");

        Assert.Equal(0, HubGenerator.Generate(root, "Messaging", "Chat"));
        Assert.Equal(1, HubGenerator.Generate(root, "Messaging", "Chat"));
    }

    [Fact]
    public void Fails_when_run_outside_a_project_directory()
    {
        var root = Directory.CreateTempSubdirectory("skies-framework-cli-test").FullName;   // no .csproj

        Assert.Equal(1, HubGenerator.Generate(root, "Messaging", "Chat"));
    }

    private static string NewProject(string name)
    {
        var root = Directory.CreateTempSubdirectory("skies-framework-cli-test").FullName;
        File.WriteAllText(Path.Combine(root, name + ".csproj"), "<Project />");
        return root;
    }
}
