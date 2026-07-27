using System.Security.Claims;

namespace Skies.Framework.Auth;

/// <summary>An <see cref="ICurrentUser"/> read straight from a <see cref="ClaimsPrincipal"/>, for the places
/// the request-scoped <see cref="HttpCurrentUser"/> can't reach — chiefly a SignalR hub, whose methods run
/// outside the HTTP request pipeline where <c>IHttpContextAccessor.HttpContext</c> is not reliably populated.
/// A hub has the authenticated principal on <c>Context.User</c>; hand it here and the caller resolves exactly
/// as an HTTP request would, since both read the same claims this library's tokens are minted with
/// (<c>sub</c> / <c>org</c> / <c>role</c> / <c>sid</c> / <c>name</c> — see <see cref="AccessTokens"/>).</summary>
/// <example>
/// In a hub, resolve the caller from the connection's principal:
/// <code>
/// public sealed class ChatHub : Hub
/// {
///     private ICurrentUser Caller => new ClaimsCurrentUser(Context.User);
/// }
/// </code>
/// </example>
public sealed class ClaimsCurrentUser(ClaimsPrincipal? principal) : ICurrentUser
{
    /// <inheritdoc />
    public bool IsAuthenticated => principal?.Identity?.IsAuthenticated ?? false;

    /// <inheritdoc />
    public Guid UserId => Guid.TryParse(principal?.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

    /// <inheritdoc />
    public Guid OrgId => Guid.TryParse(principal?.FindFirst("org")?.Value, out var id) ? id : Guid.Empty;

    /// <inheritdoc />
    public string? Role => principal?.FindFirst("role")?.Value is { Length: > 0 } role ? role : null;

    /// <inheritdoc />
    public Guid SessionId => Guid.TryParse(principal?.FindFirst("sid")?.Value, out var id) ? id : Guid.Empty;

    /// <inheritdoc />
    public string? Name => principal?.FindFirst("name")?.Value is { Length: > 0 } name ? name : null;
}
