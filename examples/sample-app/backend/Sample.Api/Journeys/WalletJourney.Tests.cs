using System.Net;
using System.Net.Http.Json;
using Sample.Api.Modules.Wallets;

namespace Sample.Tests.Journeys;

// Journeys sit beside Modules: a cross-module flow is an app-level concept, and its e2e test has no
// single slice to co-locate with. The file is *.Tests.cs, so the test project compiles it (via glob)
// and the production assembly excludes it — same mechanism as the slice tests.
//
// Deposit and Withdraw are writes, so SKY0008 requires a happy and a sad journey for each here.
// Each is declared with [Journey(typeof(<Slice>), JourneyPath.…)] so the doctor can match them to the slice.
public class WalletJourney
{
    private static readonly Guid Seeded = Guid.Parse("11111111-1111-1111-1111-111111111111");

    [E2E]
    [Journey(typeof(Deposit), JourneyPath.Happy)]
    [Fact]
    public async Task Deposit_then_balance_reflects_the_deposit()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        await client.PostAsJsonAsync("/wallets/deposit", new { walletId = Seeded, amount = 30m });
        var balance = await client.GetFromJsonAsync<GetBalance.Output>($"/wallets/{Seeded}/balance");

        Assert.Equal(30m, balance!.Balance);
    }

    // The sad journey proves the property only end-to-end can: a rejected deposit returns the failure
    // status AND leaves the balance untouched — no partial state crosses the boundary.
    [E2E]
    [Journey(typeof(Deposit), JourneyPath.Sad)]
    [Fact]
    public async Task Rejected_deposit_leaves_the_balance_untouched()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var before = await client.GetFromJsonAsync<GetBalance.Output>($"/wallets/{Seeded}/balance");

        var response = await client.PostAsJsonAsync("/wallets/deposit", new { walletId = Seeded, amount = -5m });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var after = await client.GetFromJsonAsync<GetBalance.Output>($"/wallets/{Seeded}/balance");
        Assert.Equal(before!.Balance, after!.Balance);
    }

    [E2E]
    [Journey(typeof(Withdraw), JourneyPath.Happy)]
    [Fact]
    public async Task Withdraw_then_balance_reflects_the_debit()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        await client.PostAsJsonAsync("/wallets/deposit", new { walletId = Seeded, amount = 50m });
        await client.PostAsJsonAsync("/wallets/withdraw", new { walletId = Seeded, amount = 20m });
        var balance = await client.GetFromJsonAsync<GetBalance.Output>($"/wallets/{Seeded}/balance");

        Assert.Equal(30m, balance!.Balance);
    }

    // The sad journey proves the overdraw invariant end-to-end: the wallet entity refuses the debit, so the
    // response is 422 (a business rule, not a 400 input error) AND the balance is left untouched — the
    // no-partial-state property only an end-to-end test can prove.
    [E2E]
    [Journey(typeof(Withdraw), JourneyPath.Sad)]
    [Fact]
    public async Task Overdrawing_is_rejected_and_leaves_the_balance_untouched()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        await client.PostAsJsonAsync("/wallets/deposit", new { walletId = Seeded, amount = 10m });
        var before = await client.GetFromJsonAsync<GetBalance.Output>($"/wallets/{Seeded}/balance");

        var response = await client.PostAsJsonAsync("/wallets/withdraw", new { walletId = Seeded, amount = 999m });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var after = await client.GetFromJsonAsync<GetBalance.Output>($"/wallets/{Seeded}/balance");
        Assert.Equal(before!.Balance, after!.Balance);
    }
}
