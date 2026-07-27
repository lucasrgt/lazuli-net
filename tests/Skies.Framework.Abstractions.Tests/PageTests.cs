using Skies.Framework.Abstractions;

namespace Skies.Framework.Abstractions.Tests;

public class PageTests
{
    [Fact]
    public void Select_projects_the_items_and_keeps_the_paging_facts()
    {
        // The whole point of Page.Select: a slice pages the ordered entity (ToPageAsync needs the
        // IOrderedQueryable) and projects afterwards — the paging metadata must survive untouched,
        // or every call site re-wraps it by hand and eventually one echoes the wrong total.
        var page = new Page<int>([3, 1, 2], TotalCount: 87, PageNumber: 2, PageSize: 3);

        var projected = page.Select(n => $"#{n}");

        Assert.Equal(["#3", "#1", "#2"], projected.Items);
        Assert.Equal(87, projected.TotalCount);
        Assert.Equal(2, projected.PageNumber);
        Assert.Equal(3, projected.PageSize);
    }

    [Fact]
    public void An_empty_page_still_reports_the_set_totals()
    {
        // A page past the end is empty but not meaningless: the client's pager still derives the last
        // page from TotalCount, so the metadata must stand on its own.
        var page = new Page<string>([], TotalCount: 40, PageNumber: 9, PageSize: 20);

        var projected = page.Select(s => s.Length);

        Assert.Empty(projected.Items);
        Assert.Equal(40, projected.TotalCount);
    }
}
