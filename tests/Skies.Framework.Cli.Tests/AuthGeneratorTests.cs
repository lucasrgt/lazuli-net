using Skies.Framework.Cli;
using Assay.Net;

namespace Skies.Framework.Cli.Tests;

public class AuthGeneratorTests
{
    [Fact]
    public void Single_tenant_auth_is_born_with_its_complete_executable_contract()
    {
        var api = NewSolution();

        var code = AuthGenerator.Generate(api, skipTenancy: true, skipCookies: false);

        Assert.Equal(0, code);
        var account = Path.Combine(api, "Modules", "Account");
        var manifest = SpecManifest.Load(Path.Combine(account, "Account.spec.toml"));
        Assert.Equal(new[] { "rejects-invalid-credentials", "issues-token-on-valid" }, manifest.Slices["Login"]);
        Assert.Equal(new[] { "rotates-on-refresh", "replay-burns-family" }, manifest.Slices["Refresh"]);
        Assert.Equal(new[] { "rejects-duplicate" }, manifest.Slices["Register"]);
        Assert.Equal(new[] { "returns-authenticated-principal" }, manifest.Slices["Me"]);
        Assert.Equal(new[] { "revokes-current-session" }, manifest.Slices["Logout"]);
        Assert.Equal(new[] { "returns-only-live-sessions" }, manifest.Slices["ListMySessions"]);
        Assert.Equal(new[] { "own-resource-only" }, manifest.Slices["RevokeSession"]);
        Assert.Equal(new[] { "preserves-current-session" }, manifest.Slices["RevokeOtherSessions"]);

        AssertProof(account, "Login", "rejects-invalid-credentials");
        AssertProof(account, "Refresh", "replay-burns-family");
        AssertProof(account, "Register", "rejects-duplicate");

        var solution = Path.GetFullPath(Path.Combine(api, "..", ".."));
        Assert.True(File.Exists(Path.Combine(solution, "tests", "Shop.Tests", "AvpAssert.cs")));
        var testApp = File.ReadAllText(Path.Combine(solution, "tests", "Shop.Tests", "TestApp.cs"));
        Assert.Contains("using Shop.Api;", testApp);
        Assert.DoesNotContain("using Shop.Api.Modules.Account;", testApp);

        var appJson = File.ReadAllText(Path.Combine(api, "AppJson.cs"));
        Assert.Contains("JsonStringEnumConverter", appJson);
        var authFlow = File.ReadAllText(Path.Combine(account, "AuthFlow.Tests.cs"));
        Assert.Contains("using Shop.Api;", authFlow);
        Assert.Equal(2, Count(authFlow, "AppJson.Options"));

        var refresh = File.ReadAllText(Path.Combine(account, "Slices", "Refresh.cs"));
        Assert.DoesNotContain("RefreshReuseGrace", refresh);
        Assert.Contains("await RevokeFamily(db, session.FamilyId, ct);", refresh);
        var journey = File.ReadAllText(Path.Combine(api, "Journeys", "AuthJourney.Tests.cs"));
        Assert.Contains("burns_the_live_one", journey);
        Assert.Contains("Assert.Equal(HttpStatusCode.Unauthorized, live.StatusCode);", journey);

        foreach (var file in new[] { "Me", "ListMySessions", "RevokeSession", "RevokeOtherSessions" })
        {
            var test = File.ReadAllText(Path.Combine(account, "Slices", file + ".Tests.cs"));
            Assert.Contains("public Guid OrgId => Guid.Empty;", test);
        }

        var apiProject = File.ReadAllText(Path.Combine(api, "Shop.Api.csproj"));
        Assert.Contains("<AdditionalFiles Include=\"**\\*.spec.toml\" />", apiProject);
        var testProject = File.ReadAllText(Path.Combine(solution, "tests", "Shop.Tests", "Shop.Tests.csproj"));
        Assert.Contains("PackageReference Include=\"Assay.Net\" Version=\"0.4.0\"", testProject);
        Assert.Contains("PackageReference Include=\"Skies.Framework.Testing.InMemory\"", testProject);
    }

    [Fact]
    public void Wiring_preserves_existing_package_references_without_duplicates()
    {
        var api = NewSolution(
            apiPackages: ["Microsoft.EntityFrameworkCore", "Microsoft.EntityFrameworkCore.InMemory"],
            testPackages: ["Skies.Framework.Testing.InMemory", "Assay.Net"]);

        Assert.Equal(0, AuthGenerator.Generate(api, skipTenancy: true, skipCookies: true));

        var apiProject = File.ReadAllText(Path.Combine(api, "Shop.Api.csproj"));
        Assert.Equal(1, Count(apiProject, "PackageReference Include=\"Microsoft.EntityFrameworkCore\""));
        Assert.Equal(1, Count(apiProject, "PackageReference Include=\"Microsoft.EntityFrameworkCore.InMemory\""));

        var testProject = File.ReadAllText(Path.Combine(api, "..", "..", "tests", "Shop.Tests", "Shop.Tests.csproj"));
        Assert.Equal(1, Count(testProject, "PackageReference Include=\"Skies.Framework.Testing.InMemory\""));
        Assert.Equal(1, Count(testProject, "PackageReference Include=\"Assay.Net\""));
    }

    [Theory]
    [InlineData(AuthFlow.Otp)]
    [InlineData(AuthFlow.OAuth)]
    [InlineData(AuthFlow.Email)]
    public void Every_auth_augment_declares_and_proves_each_slice_it_emits(AuthFlow flow)
    {
        var api = NewSolution();
        Assert.Equal(0, AuthGenerator.Generate(api, skipTenancy: false, skipCookies: true));

        Assert.Equal(0, AuthFlowGenerator.Generate(api, flow));

        var account = Path.Combine(api, "Modules", "Account");
        var manifest = SpecManifest.Load(Path.Combine(account, "Account.spec.toml"));
        foreach (var (slice, criterion) in FlowCriteria(flow))
        {
            Assert.Equal(new[] { criterion }, manifest.Slices[slice]);
            var test = File.ReadAllText(Path.Combine(account, "Slices", slice + ".Tests.cs"));
            Assert.Contains($"[AVP(typeof({slice}), \"{criterion}\")]", test);
        }
    }

    private static void AssertProof(string account, string slice, string criterion)
    {
        var proof = File.ReadAllText(Path.Combine(account, "Slices", slice + ".Avp.Tests.cs"));
        Assert.Contains($"[AVP(typeof({slice}), \"{criterion}\")]", proof);
        Assert.DoesNotContain("NotImplementedException", proof);
        Assert.Contains("transport: () => app.CreateClient()", proof);
    }

    private static string NewSolution(
        IReadOnlyList<string>? apiPackages = null,
        IReadOnlyList<string>? testPackages = null)
    {
        var solution = Directory.CreateTempSubdirectory("skies-auth-generator-test").FullName;
        var api = Directory.CreateDirectory(Path.Combine(solution, "src", "Shop.Api")).FullName;
        var tests = Directory.CreateDirectory(Path.Combine(solution, "tests", "Shop.Tests")).FullName;

        File.WriteAllText(Path.Combine(api, "Shop.Api.csproj"), Project(apiPackages));
        File.WriteAllText(Path.Combine(tests, "Shop.Tests.csproj"), Project(testPackages));
        File.WriteAllText(Path.Combine(api, "Program.cs"), "var builder = WebApplication.CreateBuilder(args);\nvar app = builder.Build();\napp.Run();\n");
        return api;
    }

    private static string Project(IReadOnlyList<string>? packages)
    {
        var references = packages is null
            ? string.Empty
            : string.Join("\n", packages.Select(package =>
                $"    <PackageReference Include=\"{package}\" Version=\"0.2.0\" />"));
        return $"""
            <Project Sdk="Microsoft.NET.Sdk">
              <ItemGroup>
            {references}
              </ItemGroup>
            </Project>
            """;
    }

    private static int Count(string text, string value) =>
        text.Split(value, StringSplitOptions.None).Length - 1;

    private static IReadOnlyList<(string Slice, string Criterion)> FlowCriteria(AuthFlow flow) => flow switch
    {
        AuthFlow.Otp =>
        [
            ("ResendPhoneCode", "issues-single-active-code"),
            ("VerifyPhone", "accepts-valid-code"),
        ],
        AuthFlow.OAuth =>
        [
            ("RegisterWithGoogle", "registers-verified-external-identity"),
            ("LoginWithGoogle", "issues-token-on-valid"),
        ],
        AuthFlow.Email =>
        [
            ("RequestEmailVerification", "issues-single-active-token"),
            ("VerifyEmail", "accepts-valid-token"),
            ("RequestPasswordReset", "does-not-reveal-account-existence"),
            ("ResetPassword", "invalidates-used-token"),
        ],
        _ => throw new ArgumentOutOfRangeException(nameof(flow)),
    };
}
