using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Skies.Framework.Auth;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Skies.Framework.Auth.Tests;

// Pins the agreement between AccessTokens.Issue (mint) and JwtAccessTokenExtensions.BuildValidationParameters
// (validate): a token this library signs must validate into a principal that idiomatic ASP.NET authorization
// just works against. Every test mints a real token and runs it through the real validation parameters.
public class AccessTokenValidationTests
{
    // 64 chars / 512 bits — long enough that the algorithm-substitution test can even sign HS512.
    private const string Secret = "test-secret-for-jwt-signing-please-64-chars-long-enough-for-hs512";
    private const string Issuer = "myapp";
    private const string Audience = "myapp";

    // A token with a fully-specified, coherent lifetime (iat ≤ nbf ≤ exp), signed HS256 with the test key —
    // so a lifetime test exercises expiry/skew, not an incidental iat-after-exp malformation.
    private static string MintWithLifetime(DateTime issuedAt, DateTime expires)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret));
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = Audience,
            IssuedAt = issuedAt,
            NotBefore = issuedAt,
            Expires = expires,
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
            Subject = new ClaimsIdentity([new Claim("sub", Guid.NewGuid().ToString())]),
        });
    }

    private static IAccessTokens Tokens(TimeProvider? clock = null) =>
        new AccessTokens(Secret, Issuer, Audience, clock ?? TimeProvider.System);

    private static async Task<TokenValidationResult> Validate(string jwt) =>
        await new JsonWebTokenHandler().ValidateTokenAsync(
            jwt, JwtAccessTokenExtensions.BuildValidationParameters(Secret, Issuer, Audience));

    private static async Task<ClaimsPrincipal> Principal(string jwt)
    {
        var result = await Validate(jwt);
        Assert.True(result.IsValid, result.Exception?.Message);
        return new ClaimsPrincipal(result.ClaimsIdentity);
    }

    // Seed 1: with MapInboundClaims=false the validator must pin RoleClaimType="role"/NameClaimType="name",
    // or idiomatic role checks and User.Identity.Name silently see nothing.
    [Fact]
    public async Task Role_claim_drives_idiomatic_IsInRole()
    {
        var jwt = Tokens().Issue(Guid.NewGuid(), Guid.NewGuid(), "admin", Guid.NewGuid(), "Ada");
        var user = await Principal(jwt);

        Assert.True(user.IsInRole("admin"));
        Assert.False(user.IsInRole("user"));
    }

    [Fact]
    public async Task Name_claim_drives_identity_name()
    {
        var jwt = Tokens().Issue(Guid.NewGuid(), Guid.NewGuid(), "admin", Guid.NewGuid(), "Ada");
        var user = await Principal(jwt);

        Assert.Equal("Ada", user.Identity!.Name);
    }

    // Seed 2: a 15-minute token must not be honoured ~20 minutes in. ClockSkew=30s means a token that
    // expired two minutes ago is rejected; the 5-minute default would still accept it.
    [Fact]
    public async Task A_token_expired_past_the_skew_is_rejected()
    {
        var now = DateTime.UtcNow;
        var jwt = MintWithLifetime(now.AddMinutes(-17), now.AddMinutes(-2));   // expired 2 min ago

        var result = await Validate(jwt);

        Assert.False(result.IsValid);
        Assert.IsType<SecurityTokenExpiredException>(result.Exception);
    }

    // The 30s skew is real but small: a token a few seconds past expiry is still tolerated.
    [Fact]
    public async Task A_token_within_the_skew_is_accepted()
    {
        var now = DateTime.UtcNow;
        var jwt = MintWithLifetime(now.AddMinutes(-15), now.AddSeconds(-5));   // expired 5s ago, within 30s skew

        var result = await Validate(jwt);

        Assert.True(result.IsValid, result.Exception?.Message);
    }

    [Fact]
    public async Task A_fresh_token_is_accepted()
    {
        var jwt = Tokens().Issue(Guid.NewGuid(), Guid.NewGuid(), "admin", Guid.NewGuid(), "Ada");

        var result = await Validate(jwt);

        Assert.True(result.IsValid);
    }

    // Seed 3: a null role/name must read back as null, never "". An empty claim makes `Role is null` never fire.
    [Fact]
    public async Task A_null_role_and_name_read_back_as_null()
    {
        var jwt = Tokens().Issue(Guid.NewGuid(), Guid.NewGuid(), role: null, Guid.NewGuid(), name: null);
        var user = await Principal(jwt);

        var current = new ClaimsCurrentUser(user);
        Assert.Null(current.Role);
        Assert.Null(current.Name);
    }

    [Fact]
    public async Task A_present_role_and_name_are_read()
    {
        var userId = Guid.NewGuid();
        var sid = Guid.NewGuid();
        var jwt = Tokens().Issue(userId, Guid.NewGuid(), "admin", sid, "Ada");
        var user = await Principal(jwt);

        var current = new ClaimsCurrentUser(user);
        Assert.Equal("admin", current.Role);
        Assert.Equal("Ada", current.Name);
        Assert.Equal(userId, current.UserId);
        Assert.Equal(sid, current.SessionId);
    }

    [Fact]
    public async Task Validates_the_committed_Node_issued_HS256_wire_fixture()
    {
        var fixture = JsonSerializer.Deserialize<InteropFixture>(
            await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "jwt-interop.json")),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        Assert.NotNull(fixture);

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(
            fixture.NodeToken,
            JwtAccessTokenExtensions.BuildValidationParameters(fixture.Secret, fixture.Issuer, fixture.Audience));

        Assert.True(result.IsValid, result.Exception?.Message);
        var user = new ClaimsCurrentUser(new ClaimsPrincipal(result.ClaimsIdentity));
        Assert.Equal(Guid.Parse(fixture.UserId), user.UserId);
        Assert.Equal(Guid.Parse(fixture.OrgId), user.OrgId);
        Assert.Equal(Guid.Parse(fixture.SessionId), user.SessionId);
        Assert.Equal(fixture.Role, user.Role);
        Assert.Equal(fixture.Name, user.Name);
    }

    // Seed 4: the validator pins HS256. A token signed with a different algorithm (even with the same key)
    // must be rejected, closing algorithm-substitution by construction.
    [Fact]
    public async Task A_token_signed_with_a_different_algorithm_is_rejected()
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret));
        var hs512 = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = Audience,
            Expires = DateTime.UtcNow.AddMinutes(15),
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha512),
            Subject = new ClaimsIdentity([new Claim("sub", Guid.NewGuid().ToString())]),
        });

        var result = await Validate(hs512);

        Assert.False(result.IsValid);
    }

    private sealed record InteropFixture(
        string Secret,
        string Issuer,
        string Audience,
        string NodeToken,
        string UserId,
        string OrgId,
        string SessionId,
        string Role,
        string Name);
}
