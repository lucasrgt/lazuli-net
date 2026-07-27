namespace Skies.Framework.Auth;

/// <summary>The authenticated caller of the current request, read from the validated access-token
/// claims — no session lookup per request. A slice takes this instead of touching <c>HttpContext</c>, so
/// it stays HTTP-agnostic and trivially testable (hand it a fake). The shape is the framework's blessed
/// default: a user id, the org it acts in (multi-tenant), a role (RBAC), and the session/refresh-family id.
/// An app that wants none of org/role simply ignores them.</summary>
public interface ICurrentUser
{
    /// <summary>Whether the request carried a valid access token.</summary>
    bool IsAuthenticated { get; }

    /// <summary>The caller's user id, from the token's <c>sub</c> claim.</summary>
    Guid UserId { get; }

    /// <summary>The org the caller is acting in, from the token's <c>org</c> claim.</summary>
    Guid OrgId { get; }

    /// <summary>The caller's role, from the token's <c>role</c> claim.</summary>
    string? Role { get; }

    /// <summary>The current session (refresh family) id, from the token's <c>sid</c> claim — so a slice
    /// can tell which listed session is "this one" and revoke the others.</summary>
    Guid SessionId { get; }

    /// <summary>The caller's display name, from the token's standard OIDC <c>name</c> claim — so a screen
    /// can greet the user without a read into the account module. A default member (returns null) so a
    /// caller that does not carry a name need not implement it; the HTTP reader overrides it.</summary>
    string? Name => null;
}
