using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace Skies.Framework.Auth;

/// <summary>Reads <see cref="ICurrentUser"/> from the JWT claims that ASP.NET's JwtBearer middleware put
/// on <c>HttpContext.User</c>. Stateless: the access token carries userId/org/role/sid, so resolving the
/// caller costs no database round-trip.</summary>
public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    /// <inheritdoc />
    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated ?? false;

    /// <inheritdoc />
    public Guid UserId => Guid.TryParse(Principal?.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

    /// <inheritdoc />
    public Guid OrgId => Guid.TryParse(Principal?.FindFirst("org")?.Value, out var id) ? id : Guid.Empty;

    /// <inheritdoc />
    public string? Role => Principal?.FindFirst("role")?.Value is { Length: > 0 } role ? role : null;

    /// <inheritdoc />
    public string? Name => Principal?.FindFirst("name")?.Value is { Length: > 0 } name ? name : null;

    /// <inheritdoc />
    public Guid SessionId => Guid.TryParse(Principal?.FindFirst("sid")?.Value, out var id) ? id : Guid.Empty;
}
