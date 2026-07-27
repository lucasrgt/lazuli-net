using Skies.Framework.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Skies.Framework.EntityFrameworkCore.Tests;

public class ToPageAsyncTests
{
    [Fact]
    public async Task A_middle_page_carries_its_slice_and_the_whole_sets_count()
    {
        await using var db = await SeededDb(7);

        var page = await db.Entries.OrderBy(e => e.Position).ToPageAsync(pageNumber: 2, pageSize: 3);

        Assert.Equal([4, 5, 6], page.Items.Select(e => e.Position));
        Assert.Equal(7, page.TotalCount);
        Assert.Equal(2, page.PageNumber);
        Assert.Equal(3, page.PageSize);
    }

    [Fact]
    public async Task Hostile_inputs_clamp_and_the_effective_values_are_echoed()
    {
        // The clamp is the server's, not the client's: page 0/-5 floors to 1, a huge pageSize lands on
        // the ceiling — and the page reports what was actually served, so the client's pager math never
        // runs on the raw request values.
        await using var db = await SeededDb(5);

        var floored = await db.Entries.OrderBy(e => e.Position).ToPageAsync(pageNumber: -5, pageSize: 0);
        var ceiled = await db.Entries.OrderBy(e => e.Position).ToPageAsync(1, pageSize: 10_000, maxPageSize: 50);

        Assert.Equal(1, floored.PageNumber);
        Assert.Equal(1, floored.PageSize);
        Assert.Single(floored.Items);
        Assert.Equal(50, ceiled.PageSize);
        Assert.Equal(5, ceiled.Items.Count);
    }

    [Fact]
    public async Task The_count_and_the_page_see_the_same_filtered_set()
    {
        // The defect this shape closes: a count taken from the unfiltered set while the page is filtered
        // (the tenant-leak shape). Filter first, page after — the total can only be the filtered set's.
        await using var db = await SeededDb(10);

        var page = await db.Entries.Where(e => e.Position % 2 == 0)
            .OrderBy(e => e.Position)
            .ToPageAsync(1, pageSize: 3);

        Assert.Equal(5, page.TotalCount);
        Assert.Equal([2, 4, 6], page.Items.Select(e => e.Position));
    }

    [Fact]
    public async Task A_page_past_the_end_is_empty_but_still_reports_the_totals()
    {
        await using var db = await SeededDb(4);

        var page = await db.Entries.OrderBy(e => e.Position).ToPageAsync(pageNumber: 9, pageSize: 20);

        Assert.Empty(page.Items);
        Assert.Equal(4, page.TotalCount);
        Assert.Equal(9, page.PageNumber);
    }

    [Fact]
    public async Task The_querys_order_decides_what_the_first_page_is()
    {
        await using var db = await SeededDb(6);

        var page = await db.Entries.OrderByDescending(e => e.Position).ToPageAsync(1, pageSize: 2);

        Assert.Equal([6, 5], page.Items.Select(e => e.Position));
    }

    private static async Task<LedgerDb> SeededDb(int entries)
    {
        var db = new LedgerDb(new DbContextOptionsBuilder<LedgerDb>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        db.Entries.AddRange(Enumerable.Range(1, entries).Select(i => new Entry { Position = i }));
        await db.SaveChangesAsync();
        return db;
    }

    private sealed class LedgerDb(DbContextOptions<LedgerDb> options) : DbContext(options)
    {
        public DbSet<Entry> Entries => Set<Entry>();
    }

    private sealed class Entry
    {
        public int Id { get; set; }

        public int Position { get; set; }
    }
}
