using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Skies.Framework.Auth;

/// <summary>Issues 15-minute HMAC-SHA256 access tokens. The <paramref name="secret"/>, <paramref
/// name="issuer"/>, and <paramref name="audience"/> are the same values the JwtBearer validator is
/// configured with (see <see cref="JwtAccessTokenExtensions.AddJwtAccessTokens"/>), so the tokens this
/// mints are exactly what the middleware accepts. Issuer and audience are parameters, not constants — the
/// framework names no app.</summary>
public sealed class AccessTokens(string secret, string issuer, string audience, TimeProvider clock) : IAccessTokens
{
    /// <inheritdoc />
    public string Issue(Guid userId, Guid orgId, string? role, Guid sessionId, string? name)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var claims = new List<Claim>
        {
            new("sub", userId.ToString()),
            new("org", orgId.ToString()),
            new("sid", sessionId.ToString()),
        };
        // Absent, never empty: an empty "role"/"name" claim reads back as "" not null, so a caller's
        // `Role is null` (no role) check would silently never fire. Omit the claim when there is nothing.
        if (!string.IsNullOrEmpty(role))
            claims.Add(new Claim("role", role));
        if (!string.IsNullOrEmpty(name))
            claims.Add(new Claim("name", name));

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            Expires = clock.GetUtcNow().UtcDateTime.AddMinutes(15),
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
            Subject = new ClaimsIdentity(claims),
        };
        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
