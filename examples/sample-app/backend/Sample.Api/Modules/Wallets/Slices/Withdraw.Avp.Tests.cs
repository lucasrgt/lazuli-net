using Sample.Api;
using Sample.Api.BuildingBlocks;
using Sample.Api.Modules;
using Sample.Api.Modules.Wallets;
using Assay.Net;
using Assay.Net.Archetypes;
using Skies.Framework.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Sample.Tests.Modules.Wallets;

/// <summary>
/// The AVP proof of <see cref="Withdraw"/>'s <c>idempotency-key-honored</c> spec obligation — Doctor 2 of
/// the Clockwork gate. It runs the shared backend verifier (Assay.Net's request-idempotency archetype) over the
/// REAL slice on a real HTTP server: two POSTs with the same Idempotency-Key must replay one outcome, a new key
/// must apply again. The verifier is a calibrated ruler — the second test confirms it FAILS a non-idempotent
/// withdraw, so a green here is honest and not a rubber stamp.
/// </summary>
public class WithdrawAvpProof
{
    private static readonly ProtocolCatalog AvpCatalog = Catalog.LoadDefault();

    private static Assay.Net.VerdictStatus StatusOf(Verdict v, string criterionId) =>
        v.Results.First(r => r.CriterionId == criterionId).Status;

    [AVP(typeof(Withdraw), "idempotency-key-honored")]
    [Integration]
    [Fact]
    public async Task Withdraw_honors_the_idempotency_key()
    {
        await using var server = await BootRealApp(funded: 1000m);

        var subject = new RequestIdempotencySubject(
            server.BaseUrl, "/wallets/withdraw", new { walletId = server.WalletId, amount = 10m }, IdField: "balance");
        var verdict = await Runner.Run(AvpCatalog, new RequestIdempotency(), nameof(Withdraw), subject);

        var result = verdict.Results.First(r => r.CriterionId == "idempotency-key-honored");
        Assert.True(result.Status == Assay.Net.VerdictStatus.Pass, result.Reason);
    }

    // Calibration: the same verifier MUST fail a withdraw that ignores the key (the double-withdraw escape),
    // or the proof above would be worthless.
    [Integration]
    [Fact]
    public async Task The_verifier_fails_a_non_idempotent_withdraw()
    {
        await using var bad = await BootNonIdempotentWithdraw();

        var subject = new RequestIdempotencySubject(
            bad.BaseUrl, "/wallets/withdraw", new { walletId = Guid.NewGuid(), amount = 10m }, IdField: "balance");
        var verdict = await Runner.Run(AvpCatalog, new RequestIdempotency(), "withdraw-bad", subject);

        Assert.Equal(Assay.Net.VerdictStatus.Fail, StatusOf(verdict, "idempotency-key-honored"));
    }

    // ---- real-app harness: the sample's own wiring (AddSkies + modules) on a real Kestrel port, so the
    // AVP verifier reaches the actual /wallets/withdraw over HTTP (an isolated in-memory store per run). ----
    private sealed record RunningApp(WebApplication App, string BaseUrl, Guid WalletId) : IAsyncDisposable
    {
        public ValueTask DisposeAsync() => App.DisposeAsync();
    }

    private static async Task<RunningApp> BootRealApp(decimal funded)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();
        var dbName = Guid.NewGuid().ToString(); // one stable in-memory store, shared by every AppDb in this app
        builder.Services.AddSkies();
        builder.Services.AddDbContext<AppDb>(o => o.UseInMemoryDatabase(dbName));
        builder.Services.AddIdempotency();
        builder.Services.AddModules(builder.Configuration);

        var app = builder.Build();
        app.UseSkies();
        app.MapModules();

        var walletId = Guid.NewGuid();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDb>();
            var wallet = Wallet.Open(walletId).Value;
            wallet.Deposit(Money.From(funded).Value);
            db.Wallets.Add(wallet);
            await db.SaveChangesAsync();
        }

        await app.StartAsync();
        return new RunningApp(app, BaseUrlOf(app), walletId);
    }

    private static async Task<RunningApp> BootNonIdempotentWithdraw()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();
        var app = builder.Build();

        var balance = 1000m;
        app.MapPost("/wallets/withdraw", (WithdrawCall body) =>
        {
            balance -= body.Amount; // ignores the Idempotency-Key — debits on every call
            return Results.Ok(new { balance });
        });

        await app.StartAsync();
        return new RunningApp(app, BaseUrlOf(app), Guid.Empty);
    }

    private static string BaseUrlOf(WebApplication app) =>
        app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();

    private sealed record WithdrawCall(Guid WalletId, decimal Amount);
}
