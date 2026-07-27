using System.Linq;
using System.Text.Json;

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
    }
}
