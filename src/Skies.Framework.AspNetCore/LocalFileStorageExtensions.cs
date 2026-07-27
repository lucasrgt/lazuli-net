using Skies.Framework.Storage;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.DependencyInjection;

namespace Skies.Framework.AspNetCore;

/// <summary>
/// Serves the plain URLs emitted by <see cref="LocalFileStorage"/> so direct uploads genuinely run end to end in
/// development and CI. A cloud storage implementation emits its own signed URLs, so this adapter maps nothing
/// unless the application's registered <see cref="IFileStorage"/> is the local implementation.
/// </summary>
public static class LocalFileStorageExtensions
{
    /// <summary>
    /// Map anonymous <c>PUT</c> and <c>GET</c> handlers beneath <paramref name="routePrefix"/> when local storage is
    /// registered. The prefix must match the path in the base URL passed to <see cref="LocalFileStorage"/>.
    /// </summary>
    public static IEndpointRouteBuilder MapSkiesLocalFiles(
        this IEndpointRouteBuilder endpoints,
        string routePrefix = "/files")
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        if (endpoints.ServiceProvider.GetService<IFileStorage>() is not LocalFileStorage storage)
            return endpoints;

        var prefix = NormalizePrefix(routePrefix);
        endpoints.MapPut($"{prefix}/{{**key}}", async (string? key, HttpRequest request, CancellationToken ct) =>
            {
                if (string.IsNullOrWhiteSpace(key)) return Results.BadRequest();
                try
                {
                    await storage.SaveAsync(key, request.Body, request.ContentType ?? "application/octet-stream", ct);
                    return Results.NoContent();
                }
                catch (ArgumentException)
                {
                    return Results.BadRequest();
                }
            })
            .AllowAnonymous()
            .ExcludeFromDescription();

        endpoints.MapGet($"{prefix}/{{**key}}", async (string? key, CancellationToken ct) =>
            {
                if (string.IsNullOrWhiteSpace(key)) return Results.BadRequest();
                try
                {
                    var stream = await storage.OpenReadAsync(key, ct);
                    if (stream is null) return Results.NotFound();
                    var contentType = ContentTypes.TryGetContentType(key, out var resolved)
                        ? resolved
                        : "application/octet-stream";
                    return Results.Stream(stream, contentType, enableRangeProcessing: true);
                }
                catch (ArgumentException)
                {
                    return Results.BadRequest();
                }
            })
            .AllowAnonymous()
            .ExcludeFromDescription();

        return endpoints;
    }

    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    private static string NormalizePrefix(string routePrefix)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(routePrefix);
        var prefix = routePrefix.TrimEnd('/');
        if (!prefix.StartsWith('/'))
            throw new ArgumentException("The local file route prefix must start with '/'.", nameof(routePrefix));
        if (prefix.Contains('{', StringComparison.Ordinal) || prefix.Contains('}', StringComparison.Ordinal))
            throw new ArgumentException("The local file route prefix cannot contain route parameters.", nameof(routePrefix));
        return prefix;
    }
}
