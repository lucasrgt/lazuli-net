using Skies.Framework.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace Skies.Framework.EntityFrameworkCore;

/// <summary>
/// The one-liner that turns an ordered query into the framework's canonical <see cref="Page{T}"/> —
/// the whole hand-rolled paging block (clamp, count, skip/take, echo) that every list slice otherwise
/// repeats, collapsed into a single call whose shape closes three defect classes at once (see
/// <see cref="ToPageAsync{T}"/>).
/// </summary>
public static class QueryablePageExtensions
{
    /// <summary>
    /// Materialize one page of <paramref name="query"/> as a <see cref="Page{T}"/>.
    ///
    /// Three defects are unexpressable by construction. The receiver is <see cref="IOrderedQueryable{T}"/>,
    /// not <see cref="IQueryable{T}"/> — paginating without an <c>OrderBy</c> does not compile, because an
    /// unordered Skip/Take has no stable meaning in SQL (rows repeat and vanish across pages). The count and
    /// the page run over the <em>same</em> queryable — a count taken before a tenant filter (leaking other
    /// orgs' existence into the total) cannot be written. And the raw client inputs are clamped here, server
    /// side — <paramref name="pageNumber"/> floors at 1, <paramref name="pageSize"/> lands in
    /// [1, <paramref name="maxPageSize"/>] — with the <em>effective</em> values echoed in the page, so the
    /// contract never reports a page that was not actually served.
    ///
    /// Because <c>.Select</c> erases the <see cref="IOrderedQueryable{T}"/> the receiver requires, the idiom
    /// is: page the ordered entity here, then project the (small) page in memory with
    /// <see cref="Page{T}.Select"/>. Order by a unique key — tie-break a non-unique sort with
    /// <c>.ThenBy(x =&gt; x.Id)</c> — or equal values make the page boundaries non-deterministic.
    /// </summary>
    /// <typeparam name="T">The queried entity type.</typeparam>
    /// <param name="query">The filtered, <em>ordered</em> query — both the count and the page see exactly this.</param>
    /// <param name="pageNumber">The 1-based page the client asked for; values below 1 clamp to 1.</param>
    /// <param name="pageSize">The page size the client asked for; clamps into [1, <paramref name="maxPageSize"/>].</param>
    /// <param name="maxPageSize">The server's page-size ceiling — policy, so it never travels in a contract.</param>
    /// <param name="ct">The request's cancellation token.</param>
    public static async Task<Page<T>> ToPageAsync<T>(
        this IOrderedQueryable<T> query,
        int pageNumber,
        int pageSize,
        int maxPageSize = 100,
        CancellationToken ct = default)
    {
        var page = Math.Max(1, pageNumber);
        var size = Math.Clamp(pageSize, 1, Math.Max(1, maxPageSize));
        var totalCount = await query.CountAsync(ct);
        var items = await query.Skip((page - 1) * size).Take(size).ToListAsync(ct);
        return new Page<T>(items, totalCount, page, size);
    }
}
