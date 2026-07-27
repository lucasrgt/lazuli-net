namespace Skies.Framework.Auth;

/// <summary>Mints short-lived access tokens (JWT). The crypto is ASP.NET / IdentityModel (native .NET),
/// not a third-party gem — the framework is wire over it. Pair it with the JwtBearer validator the same
/// way via <see cref="JwtAccessTokenExtensions.AddJwtAccessTokens"/>, which configures both from one
/// secret/issuer/audience so a minted token is exactly one the app accepts.</summary>
public interface IAccessTokens
{
    /// <summary>Issue a signed access token carrying the caller's identity, org, role, session id (the
    /// <c>sid</c> claim — the refresh family, so per-session management can name the current one), and
    /// display name (the standard OIDC <c>name</c> claim, so a screen can greet the user without a
    /// round-trip to the account module).</summary>
    string Issue(Guid userId, Guid orgId, string? role, Guid sessionId, string? name);
}
