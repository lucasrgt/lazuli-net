using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class EndpointAuthAnalyzerTests
{
    [Fact]
    public Task Slice_requiring_authorization_in_its_own_chain_reports_nothing() =>
        Verify("""
            using System;

            [Slice]
            class Deposit
            {
                static void Map(B app) { app.MapPost("/deposit").RequireAuthorization(); }
            }
            """ + Stubs);

    [Fact]
    public Task Slice_explicitly_anonymous_reports_nothing() =>
        Verify("""
            using System;

            [Slice]
            class Ping
            {
                static void Map(B app) { app.MapPost("/ping").AllowAnonymous(); }
            }
            """ + Stubs);

    [Fact]
    public Task Slice_mounted_on_an_authorized_group_reports_nothing() =>
        Verify("""
            using System;

            [Slice]
            class Deposit
            {
                public static void Map(B app) { app.MapPost("/deposit"); }
            }

            [Module]
            static class Wallets
            {
                public static void Map(B app)
                {
                    var group = app.MapGroup("/wallets").RequireAuthorization();
                    Deposit.Map(group);
                }
            }
            """ + Stubs);

    [Fact]
    public Task Slice_whose_group_is_authorized_in_a_later_statement_reports_nothing() =>
        Verify("""
            using System;

            [Slice]
            class Deposit
            {
                public static void Map(B app) { app.MapPost("/deposit"); }
            }

            static class Wallets
            {
                public static void Map(B app)
                {
                    var group = app.MapGroup("/wallets");
                    group.RequireAuthorization();
                    Deposit.Map(group);
                }
            }
            """ + Stubs);

    [Fact]
    public Task Slice_with_no_authorization_decision_is_flagged()
    {
        var test = NewTest("""
            using System;

            [Slice]
            class Deposit
            {
                public static void Map(B app) { app.MapPost("/deposit"); }
            }

            static class Wallets
            {
                public static void Map(B app)
                {
                    var group = app.MapGroup("/wallets");
                    Deposit.Map(group);
                }
            }
            """ + Stubs);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(EndpointAuthAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Deposit.cs", 4, 7, 4, 14)
                .WithArguments("Deposit"));
        return test.RunAsync();
    }

    [Fact]
    public Task Slice_without_a_map_is_left_to_SKY0001() =>
        Verify("""
            using System;

            [Slice]
            class Deposit
            {
            }
            """ + Stubs);

    private static Task Verify(string source) => NewTest(source).RunAsync();

    private static CSharpAnalyzerTest<EndpointAuthAnalyzer, DefaultVerifier> NewTest(string source) => new()
    {
        ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
        CompilerDiagnostics = CompilerDiagnostics.Errors,
        TestState = { Sources = { ("Deposit.cs", source) } },
    };

    // A tiny stand-in builder so the test needs no ASP.NET reference; the rule matches the chain syntactically.
    private const string Stubs = """


        class B
        {
            public B MapPost(string route) => this;
            public B MapGroup(string route) => this;
            public B RequireAuthorization() => this;
            public B AllowAnonymous() => this;
        }
        sealed class SliceAttribute : Attribute { }
        sealed class ModuleAttribute : Attribute { }
        """;
}
