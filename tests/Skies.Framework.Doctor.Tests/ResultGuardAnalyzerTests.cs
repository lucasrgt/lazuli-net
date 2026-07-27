using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class ResultGuardAnalyzerTests
{
    [Fact]
    public Task Result_checked_before_unwrap_reports_nothing() =>
        Verify("""
            class C
            {
                int Run(Result<int> result)
                {
                    if (result.IsFailure)
                        return 0;
                    return result.Value;
                }
            }
            """ + Stubs);

    [Fact]
    public Task Unchecked_unwrap_of_a_held_result_is_flagged()
    {
        var test = NewTest("""
            class C
            {
                int Run(Result<int> result) => result.Value;
            }
            """ + Stubs);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(ResultGuardAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("C.cs", 3, 43, 3, 48)
                .WithArguments("result", "Value"));
        return test.RunAsync();
    }

    [Fact]
    public Task Unchecked_error_read_is_flagged()
    {
        var test = NewTest("""
            class C
            {
                string Run(Result<int> result) => result.Error;
            }
            """ + Stubs);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(ResultGuardAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("C.cs", 3, 46, 3, 51)
                .WithArguments("result", "Error"));
        return test.RunAsync();
    }

    [Fact]
    public Task Inline_unwrap_of_a_fresh_construction_is_the_deliberate_idiom() =>
        Verify("""
            class C
            {
                int Run() => Make().Value;
                static Result<int> Make() => default;
            }
            """ + Stubs);

    [Fact]
    public Task Result_folded_through_collect_reports_nothing() =>
        Verify("""
            class C
            {
                int Run(Result<int> amount, Validation validation)
                {
                    validation.Collect("amount", amount);
                    return amount.Value;
                }
            }
            """ + Stubs);

    [Fact]
    public Task Result_checked_through_a_property_pattern_reports_nothing() =>
        Verify("""
            class C
            {
                int Run(Result<int> result)
                {
                    if (result is { IsSuccess: true })
                        return result.Value;
                    return 0;
                }
            }
            """ + Stubs);

    [Fact]
    public Task Result_born_inside_a_negated_pattern_guard_reports_nothing() =>
        // The declaring form: the name only flows past the guard on the success path.
        Verify("""
            class C
            {
                int Run()
                {
                    if (Make() is not { IsSuccess: true } parsed)
                        return 0;
                    return parsed.Value;
                }
                static Result<int> Make() => default;
            }
            """ + Stubs);

    [Fact]
    public Task A_test_file_may_unwrap_unguarded_the_throw_is_the_signal() =>
        // Same carve-out as SKY0009: in a test the exception fails the test with a stack trace — exactly
        // what the test wants; forcing an IsSuccess assert before every read is ceremony.
        NewTest("""
            class C
            {
                int Run(Result<int> result) => result.Value;
            }
            """ + Stubs, file: "C.Tests.cs").RunAsync();

    private static Task Verify(string source) => NewTest(source).RunAsync();

    private static CSharpAnalyzerTest<ResultGuardAnalyzer, DefaultVerifier> NewTest(string source, string file = "C.cs") => new()
    {
        ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
        CompilerDiagnostics = CompilerDiagnostics.Errors,
        TestState = { Sources = { (file, source) } },
    };

    // A tiny stand-in for the abstractions so the test needs no Skies reference; the rule matches the
    // type by name and arity.
    private const string Stubs = """


        readonly struct Result<T>
        {
            public bool IsSuccess => true;
            public bool IsFailure => false;
            public T Value => default!;
            public string Error => "";
        }

        class Validation
        {
            public Validation Collect<T>(string field, Result<T> result) => this;
        }
        """;
}
