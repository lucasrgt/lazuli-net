using Skies.Framework.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Routing;

namespace Skies.Framework.AspNetCore.Tests;

public class EndpointKindTests
{
    [Theory]
    [InlineData(EndpointKind.Asset, EndpointKindExtensions.AssetTag)]
    [InlineData(EndpointKind.Webhook, EndpointKindExtensions.WebhookTag)]
    [InlineData(EndpointKind.Internal, EndpointKindExtensions.InternalTag)]
    public void Non_app_kinds_carry_the_contract_tag_that_removes_them_from_the_data_client(
        EndpointKind kind,
        string expectedTag)
    {
        var builder = WebApplication.CreateBuilder();
        var app = builder.Build();

        app.MapGet("/resource", () => TypedResults.Ok()).WithEndpointKind(kind);

        var endpoint = ((IEndpointRouteBuilder)app).DataSources.SelectMany(source => source.Endpoints).Single();
        var tags = endpoint.Metadata.GetMetadata<ITagsMetadata>();
        Assert.Contains(expectedTag, tags!.Tags);
    }

    [Fact]
    public void App_kind_keeps_the_endpoint_in_the_default_client_audience()
    {
        var builder = WebApplication.CreateBuilder();
        var app = builder.Build();

        app.MapGet("/resource", () => TypedResults.Ok()).WithEndpointKind(EndpointKind.App);

        var endpoint = ((IEndpointRouteBuilder)app).DataSources.SelectMany(source => source.Endpoints).Single();
        Assert.Null(endpoint.Metadata.GetMetadata<ITagsMetadata>());
    }
}
