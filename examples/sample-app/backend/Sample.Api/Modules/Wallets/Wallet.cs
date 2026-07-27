namespace Sample.Api.Modules.Wallets;

/// <summary>
/// A wallet with a running balance — a domain entity, not a data bag. It owns its identity and its
/// invariants (a present id, a non-negative balance), and the only way to change it is through an
/// intention-revealing method (<see cref="Deposit"/>, <see cref="Withdraw"/>), never a public setter.
/// The entity lives inside the Wallets module, next to the slices that use it — not in a root Domain
/// folder — so the module stays the unit you could later lift into its own service.
/// </summary>
[Entity]
public class Wallet
{
    /// <summary>The wallet's identity, assigned when it is opened.</summary>
    public Guid Id { get; private set; }

    /// <summary>The running balance — changed only through <see cref="Deposit"/> / <see cref="Withdraw"/>.</summary>
    public Money Balance { get; private set; }

    /// <summary>The last credited amount — null until the first deposit. Doubles as the contract's
    /// nullable-scalar case: a <c>Money?</c> in a view exercises the OpenAPI mirror's Nullable unwrap.</summary>
    public Money? LastDeposit { get; private set; }

    /// <summary>
    /// The optimistic-concurrency token (SKY0026). Without this, two concurrent
    /// deposits read the same row and the second save silently erases the first. With it, the loser gets
    /// a <c>DbUpdateConcurrencyException</c> — a loud failure where a balance would have been lost.
    /// </summary>
    [System.ComponentModel.DataAnnotations.Timestamp]
    public byte[]? RowVersion { get; private set; }

    // Parameterless and private: the one constructor EF Core uses to rehydrate a row. The domain never
    // calls it — callers go through Open — so there is no public way to materialise a blank wallet.
    private Wallet() { }

    /// <summary>
    /// Open a wallet for <paramref name="id"/> with a zero balance. Identity is assigned by the caller
    /// (a wallet is one-per-owner here); creation funnels through <see cref="EnsureValid"/>, so a wallet
    /// is valid the instant it exists — there is no separate "validate" step to forget.
    /// </summary>
    public static Result<Wallet> Open(Guid id) =>
        new Wallet { Id = id, Balance = Money.Zero }.EnsureValid();

    /// <summary>
    /// Credit the wallet. <see cref="Money"/> already guarantees a non-negative amount, so a deposit can
    /// only grow the balance — there is no failure path here, hence no <see cref="Result{T}"/>.
    /// </summary>
    public void Deposit(Money amount)
    {
        Balance = Balance.Add(amount);
        LastDeposit = amount;
    }

    /// <summary>
    /// Debit the wallet, refusing to overdraw. The overdraw surfaces as <see cref="Money.Subtract"/>
    /// failing (a balance cannot go negative); the entity restates it as a business rule and leaves the
    /// balance untouched on failure.
    /// </summary>
    public Result<Wallet> Withdraw(Money amount)
    {
        var debited = Balance.Subtract(amount);
        if (debited.IsFailure)
            return Error.BusinessRule(WalletsErrorCodes.InsufficientFunds,
                $"insufficient funds: balance {Balance} cannot cover {amount}");

        Balance = debited.Value;
        return EnsureValid();
    }

    // The single invariant funnel: every creating (Open) and failable mutating (Withdraw) path returns
    // through here, so a Wallet can never be observed — or persisted — in a broken state. It is private
    // and hands back the validated entity, so there is no "validate afterwards" a caller could skip.
    private Result<Wallet> EnsureValid()
    {
        var validation = new Validation()
            .Check(Id != Guid.Empty, "id", WalletsErrorCodes.IdRequired, "is required")
            .Check(Balance.Amount >= 0, "balance", WalletsErrorCodes.BalanceNegative, "cannot be negative");
        if (validation.Failed)
            return validation.ToError();
        return this;
    }
}
