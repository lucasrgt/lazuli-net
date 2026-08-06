using System.Net;
using System.Net.Http.Json;
using Skies.Framework.Abstractions;
using Skies.Framework.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;

namespace Skies.Framework.AspNetCore.Tests;

public class ResultHttpExtensionsTests
{
    [Fact]
    public async Task Every_error_kind_has_one_canonical_status_and_envelope()
    {
        await using var app = await StartApp();
        var client = app.GetTestClient();
        var expected = new Dictionary<ErrorKind, HttpStatusCode>
        {
            [ErrorKind.Validation] = HttpStatusCode.BadRequest,
            [ErrorKind.Unauthorized] = HttpStatusCode.Unauthorized,
            [ErrorKind.Forbidden] = HttpStatusCode.Forbidden,
            [ErrorKind.NotFound] = HttpStatusCode.NotFound,
            [ErrorKind.Conflict] = HttpStatusCode.Conflict,
            [ErrorKind.BusinessRule] = HttpStatusCode.UnprocessableEntity,
            [ErrorKind.RateLimit] = HttpStatusCode.TooManyRequests,
            [ErrorKind.Internal] = HttpStatusCode.InternalServerError,
            [ErrorKind.Unavailable] = HttpStatusCode.ServiceUnavailable,
        };

        foreach (var (kind, status) in expected)
        {
            var response = await client.GetAsync($"/errors/{kind}");
            var body = await response.Content.ReadFromJsonAsync<ErrorBody>();

            Assert.Equal(status, response.StatusCode);
            Assert.Equal(kind.ToString(), body!.Error);
            Assert.Equal("contract.failure", body.Code);
        }
    }

    [Fact]
    public async Task A_success_preserves_the_value_and_returns_ok()
    {
        await using var app = await StartApp();

        var response = await app.GetTestClient().GetAsync("/success");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("kept", await response.Content.ReadFromJsonAsync<string>());
    }

    private static async Task<WebApplication> StartApp()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var app = builder.Build();
        app.MapGet("/errors/{kind}", (ErrorKind kind) =>
            Result<string>.Fail(new Error(kind, "contract.failure", "contract failed")).ToHttp());
        app.MapGet("/success", () => Result<string>.Ok("kept").ToHttp());
        await app.StartAsync();
        return app;
    }
}
