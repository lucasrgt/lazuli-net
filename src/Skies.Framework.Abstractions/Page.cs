using System;
using System.Collections.Generic;
using System.Linq;

namespace Skies.Framework.Abstractions;

/// <summary>
/// One page of a larger collection — the standard shape a paginated list slice returns, the collection
/// analogue of <see cref="Result{T}"/>. Without a canonical page every slice invents its own output and the
/// generated client gets a distinct ad-hoc type per list, so nothing downstream (the typed client, the
/// frontend spine's pager hooks) can recognize "this is a page" and compose. With it, the contract is
/// uniform end-to-end: the OpenAPI document carries one page shape per item type and the spine's hooks
/// match it structurally.
///
/// The page is produced by <c>ToPageAsync</c> (the <c>Skies.Framework.EntityFrameworkCore</c> satellite) and travels
/// inside the slice's <c>Output</c> by composition — <c>record Output(Page&lt;ReviewView&gt; Reviews,
/// double AverageRating)</c> — never by record inheritance. <see cref="TotalCount"/> always counts the whole
/// filtered set (it is what a numbered pager derives "1–20 of 87" from), and it is deliberately explicit in
/// the contract: a page that reports a total is a page that paid a COUNT.
/// </summary>
/// <typeparam name="T">The item type the page carries.</typeparam>
/// <param name="Items">The items of this page, in the query's order — at most <paramref name="PageSize"/> of them.</param>
/// <param name="TotalCount">The size of the whole filtered set, not of this page.</param>
/// <param name="PageNumber">The 1-based number of this page, after server-side clamping — the effective value, never the raw input.</param>
/// <param name="PageSize">The page size actually served, after server-side clamping — the effective value, never the raw input.</param>
public sealed record Page<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int PageNumber,
    int PageSize)
{
    /// <summary>
    /// Project the items into another shape, keeping the paging facts intact. This exists because the EF
    /// extension pages the <em>ordered entity</em> (a <c>.Select</c> would erase the <c>IOrderedQueryable</c>
    /// the extension requires), so a slice projects the page in memory afterwards — and re-wrapping the
    /// metadata by hand at every call site is exactly the boilerplate the type exists to kill.
    /// </summary>
    /// <typeparam name="TOut">The shape each item is projected into.</typeparam>
    /// <param name="selector">The per-item projection.</param>
    public Page<TOut> Select<TOut>(Func<T, TOut> selector) =>
        new(Items.Select(selector).ToList(), TotalCount, PageNumber, PageSize);
}
