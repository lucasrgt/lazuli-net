using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class RawSqlAnalyzerTests
{
    [Fact]
    public Task Constant_raw_sql_reports_nothing() =>
        Verify("""
            class Q
            {
                void Run(Db db) => db.ExecuteSqlRaw("DELETE FROM outbox WHERE done = 1");
            }
            """ + Stubs);

    [Fact]
    public Task Parameterizing_twin_with_interpolation_reports_nothing() =>
        Verify("""
            class Q
            {
                void Run(Db db, string name) => db.ExecuteSql($"DELETE FROM outbox WHERE name = {name}");
            }
            """ + Stubs);

    [Fact]
    public Task Interpolated_raw_sql_is_flagged()
    {
        var test = NewTest("""
            class Q
            {
                void Run(Db db, string name) => db.ExecuteSqlRaw($"DELETE FROM outbox WHERE name = {name}");
            }
            """ + Stubs);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(RawSqlAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Q.cs", 3, 40, 3, 53)
                .WithArguments("ExecuteSqlRaw", "ExecuteSql"));
        return test.RunAsync();
    }

    [Fact]
    public Task Concatenated_raw_sql_is_flagged()
    {
        var test = NewTest("""
            class Q
            {
                void Run(Db db, string name) => db.FromSqlRaw("SELECT * FROM t WHERE name = '" + name + "'");
            }
            """ + Stubs);
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(RawSqlAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("Q.cs", 3, 40, 3, 50)
                .WithArguments("FromSqlRaw", "FromSql"));
        return test.RunAsync();
    }

    [Fact]
    public Task Concatenation_of_literals_reports_nothing() =>
        Verify("""
            class Q
            {
                void Run(Db db) => db.FromSqlRaw("SELECT * FROM t " + "WHERE done = 1");
            }
            """ + Stubs);

    private static Task Verify(string source) => NewTest(source).RunAsync();

    private static CSharpAnalyzerTest<RawSqlAnalyzer, DefaultVerifier> NewTest(string source) => new()
    {
        ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
        CompilerDiagnostics = CompilerDiagnostics.Errors,
        TestState = { Sources = { ("Q.cs", source) } },
    };

    // A tiny stand-in for the EF surface so the test needs no EF Core reference; the rule matches the
    // method names and the argument shape syntactically.
    private const string Stubs = """


        class Db
        {
            public void ExecuteSqlRaw(string sql) { }
            public void ExecuteSql(System.FormattableString sql) { }
            public void FromSqlRaw(string sql) { }
        }
        """;
}
