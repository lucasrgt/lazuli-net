using System.Globalization;
using Skies.Framework.Abstractions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

namespace Skies.Framework.AspNetCore;

/// <summary>
/// The platform-tier error codes the framework itself can emit — a `*ErrorCodes` registry like every module's,
/// so the OpenAPI wiring (<see cref="OpenApiExtensions.AddSkiesOpenApi"/>) enumerates these into the
/// <c>ErrorBody.code</c> contract alongside the app's and the frontend's i18n catalog covers them too.
/// </summary>
public static class PlatformErrorCodes
{
    /// <summary>A request rejected by the rate limiter (HTTP 429).</summary>
    public const string RateLimited = "platform.rate_limited";
}

/// <summary>
/// The bridge between ASP.NET Core's rate limiter and Skies's error contract. The limiter's default rejection
/// is an empty 429 — invisible to a typed client that reads every failure as an <see cref="ErrorBody"/>. This
/// renders the rejection in the envelope (with the <see cref="PlatformErrorCodes.RateLimited"/> code the client
/// localizes, and a <c>Retry-After</c> header when the limiter knows the window), so the client handles a rate
/// limit like any other error. The bridge is the framework's; the policies (limits, windows, which endpoints
/// opt in) stay app policy in the platform layer. Graduated from the hostpoint pilot.
/// </summary>
public static class RateLimitingExtensions
{
    /// <summary>
    /// Render rejections as Skies's <see cref="ErrorBody"/> envelope. Call inside <c>AddRateLimiter</c>:
    /// <code>
    /// services.AddRateLimiter(options =>
    /// {
    ///     options.GlobalLimiter = /* the app's policy */;
    ///     options.RejectAsSkiesError();
    /// });
    /// </code>
    /// </summary>
    public static RateLimiterOptions RejectAsSkiesError(this RateLimiterOptions options)
    {
        options.OnRejected = (context, ct) => WriteRejection(context, ct);
        return options;
    }

    private static async ValueTask WriteRejection(OnRejectedContext context, CancellationToken ct)
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        await context.HttpContext.Response.WriteAsJsonAsync(
            new ErrorBody(nameof(ErrorKind.RateLimit), PlatformErrorCodes.RateLimited,
                "Too many requests. Please slow down.", null), ct);
    }
}
