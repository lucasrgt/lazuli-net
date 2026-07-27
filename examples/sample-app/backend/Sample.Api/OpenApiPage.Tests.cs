using System.Linq;
using System.Text.Json;

namespace Sample.Tests;

// The page contract, dogfooded: the frontend spine's pager hooks match Page<T> STRUCTURALLY
// ({ items, totalCount, pageNumber, pageSize }), so the document must present the four members as
// required, plainly typed numbers (no read-from-string union leaking in) — and each Page<T>
// instantiation must get a collision-free schema id qualified by its item's slice. This test pins
// all three; if the generator's defaults drift, the seam in AddSkiesOpenApi absorbs it, not the apps.
public class OpenApiPage
{
    [Fact]
    public async Task The_page_schema_is_required_plainly_numeric_and_slice_qualified()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        using var document = JsonDocument.Parse(await client.GetStringAsync("/openapi/v1.json"));
        var page = document.RootElement
            .GetProperty("components").GetProperty("schemas")
            .GetProperty("PageOfListWalletsWalletView");

        var required = page.GetProperty("required").EnumerateArray().Select(v => v.GetString()).ToList();
        Assert.Equal(["items", "totalCount", "pageNumber", "pageSize"], required);

        // Plain single types: "array" / "integer" — not ["integer","string"], which a client generator
        // faithfully turns into `number | string` and the spine's structural Page<T> no longer matches.
        Assert.Equal(JsonValueKind.String, page.GetProperty("properties").GetProperty("items").GetProperty("type").ValueKind);
        Assert.Equal("array", page.GetProperty("properties").GetProperty("items").GetProperty("type").GetString());
        Assert.Equal("integer", page.GetProperty("properties").GetProperty("totalCount").GetProperty("type").GetString());
        Assert.Equal("integer", page.GetProperty("properties").GetProperty("pageNumber").GetProperty("type").GetString());
        Assert.Equal("integer", page.GetProperty("properties").GetProperty("pageSize").GetProperty("type").GetString());
    }

    [Fact]
    public async Task The_slices_output_composes_the_page_by_reference()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        using var document = JsonDocument.Parse(await client.GetStringAsync("/openapi/v1.json"));
        var wallets = document.RootElement
            .GetProperty("components").GetProperty("schemas")
            .GetProperty("ListWalletsOutput").GetProperty("properties").GetProperty("wallets");

        Assert.Equal("#/components/schemas/PageOfListWalletsWalletView", wallets.GetProperty("$ref").GetString());
    }
}
