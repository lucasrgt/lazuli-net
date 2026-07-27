using System.Text.Json;
using System.Threading.RateLimiting;
using Skies.Framework.AspNetCore;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;

namespace Skies.Framework.AspNetCore.Tests;

public class RateLimitingExtensionsTests
{
    [Fact]
    public async Task A_rejection_renders_the_error_envelope_with_the_platform_code()
    {
        // The bridge's whole reason to exist: a 429 must look like every other failure to the typed client —
        // the ErrorBody envelope with a localizable registry code, not an empty status.
        var context = await Reject(new LeaseWithRetryAfter(TimeSpan.FromSeconds(30)));

        Assert.Equal(StatusCodes.Status429TooManyRequests, context.Response.StatusCode);
        var body = JsonSerializer.Deserialize<ErrorBody>(BodyOf(context), Json);
        Assert.Equal(PlatformErrorCodes.RateLimited, body!.Code);
        Assert.Equal("RateLimit", body.Error);
    }

    [Fact]
    public async Task The_retry_window_surfaces_as_a_retry_after_header()
    {
        var context = await Reject(new LeaseWithRetryAfter(TimeSpan.FromSeconds(30)));

        Assert.Equal("30", context.Response.Headers.RetryAfter.ToString());
    }

    [Fact]
    public async Task A_lease_without_a_window_omits_the_header_but_still_renders_the_envelope()
    {
        var context = await Reject(new LeaseWithRetryAfter(null));

        Assert.True(string.IsNullOrEmpty(context.Response.Headers.RetryAfter.ToString()));
        Assert.Equal(StatusCodes.Status429TooManyRequests, context.Response.StatusCode);
    }

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static async Task<HttpContext> Reject(RateLimitLease lease)
    {
        var options = new RateLimiterOptions().RejectAsSkiesError();
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        await options.OnRejected!(new OnRejectedContext { HttpContext = context, Lease = lease }, default);
        return context;
    }

    private static string BodyOf(HttpContext context)
    {
        context.Response.Body.Position = 0;
        return new StreamReader(context.Response.Body).ReadToEnd();
    }

    private sealed class LeaseWithRetryAfter(TimeSpan? retryAfter) : RateLimitLease
    {
        public override bool IsAcquired => false;

        public override IEnumerable<string> MetadataNames => [MetadataName.RetryAfter.Name];

        public override bool TryGetMetadata(string metadataName, out object? metadata)
        {
            metadata = retryAfter;
            return metadataName == MetadataName.RetryAfter.Name && retryAfter is not null;
        }
    }
}
