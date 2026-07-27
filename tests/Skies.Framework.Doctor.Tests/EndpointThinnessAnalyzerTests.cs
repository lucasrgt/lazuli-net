namespace Skies.Framework.Doctor.Tests;

public class EndpointThinnessAnalyzerTests
{
    [Fact]
    public Task Expression_bodied_route_reports_nothing() =>
        Harness<EndpointThinnessAnalyzer>.Verify(ExpressionBodied);

    [Fact]
    public Task Block_bodied_route_is_flagged() =>
        Harness<EndpointThinnessAnalyzer>.Verify(BlockBodied);

    private const string ExpressionBodied = """
        using System;

        public class Routes
        {
            public void MapGet(string pattern, Delegate handler) { }
            public void MapPost(string pattern, Delegate handler) { }
        }

        public class Endpoints
        {
            public void Register(Routes app) => app.MapGet("/x", () => 1);
        }
        """;

    private const string BlockBodied = """
        using System;

        public class Routes
        {
            public void MapGet(string pattern, Delegate handler) { }
            public void MapPost(string pattern, Delegate handler) { }
        }

        public class Endpoints
        {
            public void Register(Routes app) => app.MapPost("/x", () => {|SKY0002:{ return 1; }|});
        }
        """;
}
