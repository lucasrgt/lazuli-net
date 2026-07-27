using Skies.Framework.Auth;
using Microsoft.AspNetCore.Http;

namespace Skies.Framework.Auth.Tests;

// Pins what actually reaches the wire when the refresh cookie is planted. The non-negotiable security
// attributes (httpOnly, Secure outside HTTP loopback) are framework-owned; SameSite and Domain ride from the options — the
// multi-subdomain knob a real pilot needed (a "remember this device" cookie shared across sibling
// subdomains) instead of re-implementing the cookie by hand app-side. Reading the Set-Cookie header proves
// the attributes survive serialization, not merely that the CookieOptions were set.
public class RefreshCookieTests
{
    private static string PlantAndRead(
        RefreshCookieOptions options,
        string scheme = "https",
        string host = "app.example.com")
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Scheme = scheme;
        ctx.Request.Host = new HostString(host);
        new RefreshCookie(options).SetRefresh(ctx.Response, "the-token", DateTimeOffset.UtcNow.AddDays(30));
        return ctx.Response.Headers["Set-Cookie"].ToString();
    }

    [Theory]
    [InlineData("localhost")]
    [InlineData("127.0.0.1")]
    [InlineData("[::1]")]
    public void Plain_http_loopback_omits_secure_so_local_web_refresh_can_return_the_cookie(string host)
    {
        var cookie = PlantAndRead(new RefreshCookieOptions("app_refresh"), "http", host);

        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("secure", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Non_loopback_http_stays_secure_when_tls_terminates_upstream()
    {
        var cookie = PlantAndRead(new RefreshCookieOptions("app_refresh"), "http", "app.example.com");

        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Default_cookie_is_httponly_secure_strict_and_host_only()
    {
        var cookie = PlantAndRead(new RefreshCookieOptions("app_refresh"));

        Assert.Contains("app_refresh=the-token", cookie);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("domain=", cookie, StringComparison.OrdinalIgnoreCase);   // null Domain ⇒ host-only
    }

    [Fact]
    public void Domain_and_samesite_ride_from_options_for_the_multi_subdomain_case()
    {
        var cookie = PlantAndRead(new RefreshCookieOptions(
            "app_refresh", Domain: ".example.com", SameSite: SameSiteMode.Lax));

        Assert.Contains("domain=.example.com", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);
        // widening SameSite/Domain never relaxes the two that are not a per-app choice
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Clear_deletes_under_the_same_path_and_domain_so_the_browser_drops_it()
    {
        var ctx = new DefaultHttpContext();
        new RefreshCookie(new RefreshCookieOptions("app_refresh", Path: "/account", Domain: ".example.com"))
            .Clear(ctx.Response);
        var cookie = ctx.Response.Headers["Set-Cookie"].ToString();

        Assert.Contains("app_refresh=", cookie);
        Assert.Contains("domain=.example.com", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/account", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("expires=", cookie, StringComparison.OrdinalIgnoreCase);   // a deletion is an expiry in the past
    }
}
