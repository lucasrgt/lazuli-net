using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public sealed class FrontendFeatureScopeTests
{
    [Fact]
    public void Surface_features_and_flow_companions_do_not_select_namesakes_in_another_package()
    {
        var root = Directory.CreateTempSubdirectory("skies-feature-scope-").FullName;
        try
        {
            var packages = new[] { "first", "second" }.Select(name =>
            {
                var package = Path.Combine(root, "clients", name);
                Directory.CreateDirectory(Path.Combine(package, "e2e"));
                foreach (var feature in new[] { "Login", "Shared" })
                {
                    var directory = Path.Combine(package, "src", "features", feature);
                    Directory.CreateDirectory(directory);
                    File.WriteAllText(Path.Combine(directory, feature + ".viewModel.ts"), "export const value = 1;");
                    File.WriteAllText(Path.Combine(directory, feature + ".test.ts"), "test('proof', () => {});");
                }
                File.WriteAllText(Path.Combine(package, "e2e", "flows.json"),
                    """[{"id":"login","target":"web","spec":"e2e/login.spec.ts","features":["Login","Shared"],"backendSlices":[]}]""");
                return new FrontendPackage(package, FrontendPackageRole.Surface);
            }).ToArray();

            var plan = GateImpact.Build(root, ["clients/first/src/features/Login/Login.viewModel.ts"],
                [], [], [], [], packages);

            Assert.Equal(2, plan.Frontends[0].Tests.Count);
            Assert.Single(plan.Frontends[0].Flows);
            Assert.False(plan.Frontends[1].Selected);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
