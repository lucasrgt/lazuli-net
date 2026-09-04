using System.Linq;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Skies.Framework.AspNetCore;

namespace Sample.Tests;

// The error-code contract, dogfooded: the framework enumerates every *ErrorCodes constant into the OpenAPI
// ErrorBody.code schema (an OpenAPI schema transformer in Skies.Framework.AspNetCore, fed by reflection — SKY0018
// guarantees the registries are the complete set). So the generated client is typed on the closed set of codes
// and the frontend can be checked for an exhaustive translation of each.
public class OpenApiErrorCodes
{
    [Fact]
    public async Task ErrorBody_code_is_enumerated_in_the_openapi_document()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        using var document = JsonDocument.Parse(await client.GetStringAsync("/openapi/v1.json"));
        var codes = document.RootElement
            .GetProperty("components").GetProperty("schemas")
            .GetProperty("ErrorBody").GetProperty("properties")
            .GetProperty("code").GetProperty("enum")
            .EnumerateArray().Select(value => value.GetString()).ToList();

        // The Wallets + Money registry constants must all appear — the enum is the contract the client localizes.
        Assert.Contains("wallets.not_found", codes);
        Assert.Contains("wallets.insufficient_funds", codes);
        Assert.Contains("wallet.id.required", codes);
        Assert.Contains("money.negative", codes);
        Assert.Contains(PlatformErrorCodes.RateLimited, codes);
        Assert.DoesNotContain(DependencyErrorCodes.UniqueViolation, codes);
    }

    [Fact]
    public async Task Additional_registry_assemblies_require_explicit_registration()
    {
        await using var app = new TestApp();
        await using var modularApp = app.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.AddSkiesOpenApi(typeof(DependencyErrorCodes).Assembly)));
        using var client = modularApp.CreateClient();
        using var document = JsonDocument.Parse(await client.GetStringAsync("/openapi/v1.json"));
        var codes = document.RootElement.GetProperty("components").GetProperty("schemas")
            .GetProperty("ErrorBody").GetProperty("properties").GetProperty("code").GetProperty("enum")
            .EnumerateArray().Select(value => value.GetString()).ToList();

        Assert.Contains(DependencyErrorCodes.UniqueViolation, codes);
        Assert.Contains("wallets.not_found", codes);
        Assert.Contains(PlatformErrorCodes.RateLimited, codes);
        Assert.Equal(codes.Count, codes.Distinct().Count());
    }

    // Loaded with the test process, but not owned by the hosted application. A vendor such as
    // Npgsql also exposes *ErrorCodes constants; loading that library must not widen the API.
    internal static class DependencyErrorCodes
    {
        public const string UniqueViolation = "23505";
    }
}
