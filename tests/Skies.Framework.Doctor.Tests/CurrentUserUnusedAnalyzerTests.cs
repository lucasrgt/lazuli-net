using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class CurrentUserUnusedAnalyzerTests
{
    [Fact]
    public Task Slice_consulting_the_caller_reports_nothing() =>
        Verify("""
            using System;

            [Slice]
            class GetProfile
            {
                public static string Handle(ICurrentUser user) => user.UserId;
            }
            """ + Stubs);

    [Fact]
    public Task Slice_ignoring_the_injected_caller_is_flagged()
    {
        var test = NewTest("""
            using System;

            [Slice]
            class GetProfile
            {
                public static string Handle(ICurrentUser user) => "anyone";
            }
            """ + Stubs);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(CurrentUserUnusedAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Slice.cs", 6, 33, 6, 50)
                .WithArguments("GetProfile", "user"));
        return test.RunAsync();
    }

    [Fact]
    public Task Slice_without_a_current_user_parameter_reports_nothing() =>
        Verify("""
            using System;

            [Slice]
            class Ping
            {
                public static string Handle(int input) => input.ToString();
            }
            """ + Stubs);

    [Fact]
    public Task Non_slice_class_is_not_this_rules_concern() =>
        Verify("""
            using System;

            class Helper
            {
                public static string Handle(ICurrentUser user) => "anyone";
            }
            """ + Stubs);

    private static Task Verify(string source) => NewTest(source).RunAsync();

    private static CSharpAnalyzerTest<CurrentUserUnusedAnalyzer, DefaultVerifier> NewTest(string source) => new()
    {
        ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
        CompilerDiagnostics = CompilerDiagnostics.Errors,
        TestState = { Sources = { ("Slice.cs", source) } },
    };

    // A tiny stand-in for the auth seam so the test needs no Skies.Framework.Auth reference; the rule matches the
    // parameter type by simple name.
    private const string Stubs = """


        interface ICurrentUser { string UserId { get; } }
        sealed class SliceAttribute : Attribute { }
        """;
}
