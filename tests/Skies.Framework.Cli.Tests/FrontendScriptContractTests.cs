using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class FrontendScriptContractTests
{
    [Fact]
    public void A_real_runner_command_is_executable_evidence()
    {
        var root = Package("""{ "scripts": { "test": "vitest run" } }""");
        try
        {
            Assert.Null(FrontendScriptContract.Validate(root, "test"));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Theory]
    [InlineData("echo no tests configured")]
    [InlineData("printf 'ok'")]
    [InlineData("true")]
    [InlineData("exit 0")]
    public void A_placeholder_is_not_executable_evidence(string command)
    {
        var root = Package($$"""{ "scripts": { "test": "{{command}}" } }""");
        try
        {
            var error = FrontendScriptContract.Validate(root, "test");

            Assert.NotNull(error);
            Assert.Contains("placeholder", error);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void A_missing_required_script_is_not_executable_evidence()
    {
        var root = Package("""{ "scripts": {} }""");
        try
        {
            var error = FrontendScriptContract.Validate(root, "test:e2e");

            Assert.NotNull(error);
            Assert.Contains("test:e2e", error);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void A_composed_test_script_uses_its_dedicated_unit_runner()
    {
        var root = Package("""
            { "scripts": {
              "test": "npm run test:unit && npm run test:e2e",
              "test:unit": "vitest run",
              "test:e2e": "playwright test"
            } }
            """);
        try
        {
            Assert.Equal("test:unit", FrontendScriptContract.ResolveUnitTestScript(root));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void A_simple_package_keeps_its_test_runner()
    {
        var root = Package("""{ "scripts": { "test": "vitest run" } }""");
        try
        {
            Assert.Equal("test", FrontendScriptContract.ResolveUnitTestScript(root));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Theory]
    [InlineData("playwright test")]
    [InlineData("tsc --noEmit -p e2e/tsconfig.json && playwright test")]
    [InlineData("npx --no-install playwright test")]
    public void Target_web_requires_a_complete_Playwright_runner(string command)
    {
        var root = Package($$"""{ "scripts": { "test:e2e": "{{command}}" } }""", "web");
        try
        {
            Assert.Null(FrontendScriptContract.Validate(root, "test:e2e"));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void Target_native_requires_the_complete_Maestro_directory()
    {
        var root = Package("""{ "scripts": { "test:e2e": "maestro test e2e" } }""", "native");
        try
        {
            Assert.Null(FrontendScriptContract.Validate(root, "test:e2e"));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Theory]
    [InlineData("web", "maestro test e2e", "Playwright")]
    [InlineData("native", "playwright test", "Maestro")]
    [InlineData("web", "cypress run", "noncanonical")]
    [InlineData("native", "detox test", "noncanonical")]
    public void A_target_cannot_choose_another_runner(string target, string command, string expected)
    {
        var root = Package($$"""{ "scripts": { "test:e2e": "{{command}}" } }""", target);
        try
        {
            var error = FrontendScriptContract.Validate(root, "test:e2e");

            Assert.NotNull(error);
            Assert.Contains(expected, error, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Theory]
    [InlineData("web", "playwright test e2e/login.spec.ts")]
    [InlineData("web", "playwright test --grep login")]
    [InlineData("web", "node scripts/e2e-release.mjs")]
    [InlineData("native", "maestro test e2e/login.yaml")]
    public void A_narrowed_or_opaque_e2e_runner_is_not_release_evidence(string target, string command)
    {
        var root = Package($$"""{ "scripts": { "test:e2e": "{{command}}" } }""", target);
        try
        {
            var error = FrontendScriptContract.Validate(root, "test:e2e");

            Assert.NotNull(error);
            Assert.Contains("unfiltered", error);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static string Package(string json, string? target = null)
    {
        var root = Path.Combine(Path.GetTempPath(), "skies-frontend-script-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        File.WriteAllText(Path.Combine(root, "package.json"), json);
        if (target is not null)
        {
            var e2e = Directory.CreateDirectory(Path.Combine(root, "e2e"));
            File.WriteAllText(
                Path.Combine(e2e.FullName, "flows.json"),
                $$"""[{ "id": "proof", "target": "{{target}}" }]""");
        }
        return root;
    }
}
