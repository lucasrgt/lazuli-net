using System.Reflection;
using Skies.Framework.Abstractions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Http.Metadata;

namespace Skies.Framework.AspNetCore;

/// <summary>
/// The wire shape of a failed <see cref="Result{T}"/> — the error envelope every endpoint returns on the sad
/// path. A named type (not an anonymous object) so it lands in the OpenAPI document and the generated client is
/// typed on the sad path too — which is what carries the <c>code</c> to the frontend for free: the client reads
/// it from the typed envelope and renders localized copy keyed by it (the <c>message</c> is only a dev hint).
/// </summary>
/// <param name="Error">The <see cref="ErrorKind"/> name (e.g. <c>NotFound</c>) — drives the HTTP status.</param>
/// <param name="Code">The stable, language-neutral i18n key the client localizes from (e.g. <c>wallets.insufficient_funds</c>).</param>
/// <param name="Message">A developer-facing message (English); not the copy a user reads.</param>
/// <param name="Fields">The field-level errors when the failure is a multi-field validation; otherwise null.</param>
public sealed record ErrorBody(string Error, string Code, string Message, IReadOnlyList<FieldError>? Fields);

/// <summary>
/// Maps a domain <see cref="Result{T}"/> to an HTTP response at the route boundary, so slice handlers never
/// reference <c>IResult</c> and stay unit-testable without a web host. The <see cref="ErrorKind"/> drives the
/// status — one mapping, identical for every Skies app, so the framework ships it instead of each app
/// re-deriving it.
/// </summary>
public static class ResultHttpExtensions
{
    /// <summary>Render the result as a <see cref="SkiesHttpResult{T}"/> — the value with <c>200</c> on success,
    /// or an <see cref="ErrorBody"/> with its <see cref="ErrorKind"/>-mapped status on failure. The result
    /// contributes endpoint metadata for both arms, so ASP.NET's OpenAPI documents the <typeparamref name="T"/>
    /// success schema <em>and</em> the <see cref="ErrorBody"/> error schema — which is what makes the generated
    /// client typed end to end (and carries the error <c>code</c> enum to the frontend).</summary>
    public static SkiesHttpResult<T> ToHttp<T>(this Result<T> result) => new(result);

    // Exhaustive over ErrorKind: add a kind without a case here and the compiler flags it.
    internal static int StatusFor(ErrorKind kind) => kind switch
    {
        ErrorKind.Validation => StatusCodes.Status400BadRequest,
        ErrorKind.Unauthorized => StatusCodes.Status401Unauthorized,
        ErrorKind.Forbidden => StatusCodes.Status403Forbidden,
        ErrorKind.NotFound => StatusCodes.Status404NotFound,
        ErrorKind.Conflict => StatusCodes.Status409Conflict,
        ErrorKind.BusinessRule => StatusCodes.Status422UnprocessableEntity,
        ErrorKind.RateLimit => StatusCodes.Status429TooManyRequests,
        ErrorKind.Internal => StatusCodes.Status500InternalServerError,
        ErrorKind.Unavailable => StatusCodes.Status503ServiceUnavailable,
    };
}

/// <summary>
/// The HTTP rendering of a slice's <see cref="Result{T}"/>: the value with <c>200</c> on success, or an
/// <see cref="ErrorBody"/> with the <see cref="ErrorKind"/>-mapped status on failure. It is its own result type
/// (not a <c>Results&lt;,&gt;</c> union) so it can advertise <em>both</em> arms to OpenAPI — the success
/// <typeparamref name="T"/> and the <see cref="ErrorBody"/> envelope — which a dynamic-status
/// <c>JsonHttpResult</c> cannot. That documented envelope is what carries the error <c>code</c> (and its enum)
/// into the generated client.
/// </summary>
/// <typeparam name="T">The success value type.</typeparam>
public sealed class SkiesHttpResult<T> : IResult, IEndpointMetadataProvider
{
    private readonly Result<T> _result;

    internal SkiesHttpResult(Result<T> result) => _result = result;

    /// <inheritdoc />
    public Task ExecuteAsync(HttpContext httpContext)
    {
        IResult response = _result.IsSuccess
            ? TypedResults.Ok(_result.Value)
            : TypedResults.Json(
                new ErrorBody(_result.Error.Kind.ToString(), _result.Error.Code, _result.Error.Message, _result.Error.Fields),
                statusCode: ResultHttpExtensions.StatusFor(_result.Error.Kind));
        return response.ExecuteAsync(httpContext);
    }

    /// <summary>Advertise both arms to OpenAPI: the <typeparamref name="T"/> success and the
    /// <see cref="ErrorBody"/> envelope at the statuses Skies maps errors to. Reuses the framework's own typed
    /// results so the metadata stays canonical — and so the <see cref="ErrorBody"/> schema (with its code enum)
    /// is always present in the document.</summary>
    static void IEndpointMetadataProvider.PopulateMetadata(MethodInfo method, EndpointBuilder builder)
    {
        Contribute<Ok<T>>(method, builder);
        Contribute<BadRequest<ErrorBody>>(method, builder);
        Contribute<NotFound<ErrorBody>>(method, builder);
        Contribute<Conflict<ErrorBody>>(method, builder);
        Contribute<UnprocessableEntity<ErrorBody>>(method, builder);
    }

    // PopulateMetadata is an explicit static interface member on each typed result, reachable only through a
    // constrained type parameter.
    private static void Contribute<TResult>(MethodInfo method, EndpointBuilder builder)
        where TResult : IEndpointMetadataProvider =>
        TResult.PopulateMetadata(method, builder);
}
