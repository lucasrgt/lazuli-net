using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class JourneyCoversWriteAnalyzerTests
{
    [Fact]
    public Task A_journey_covering_a_write_slice_is_fine() =>
        Make(WriteSlice, """
            [Journey(typeof(Deposit), JourneyPath.Happy)]
            [Journey(typeof(Deposit), JourneyPath.Sad)]
            """).RunAsync();

    [Fact]
    public Task A_journey_covering_a_read_slice_is_flagged()
    {
        var test = Make(ReadSlice, "[Journey(typeof(Deposit), JourneyPath.Happy)]");
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(JourneyCoversWriteAnalyzer.DiagnosticId, DiagnosticSeverity.Error)
                .WithSpan("WalletFlow.Tests.cs", 1, 17, 1, 24)
                .WithArguments("Deposit"));
        return test.RunAsync();
    }

    [Fact]
    public Task A_plain_e2e_flow_without_a_journey_is_fine() =>
        Make(ReadSlice, "// just an [E2E] flow, no [Journey] attribute").RunAsync();

    private const string WriteSlice = """
        using System;

        [Slice]
        public class Deposit
        {
            public static void Map(Endpoints app) => app.MapPost();
        }
        """;

    private const string ReadSlice = """
        using System;

        [Slice]
        public class Deposit
        {
            public static void Map(Endpoints app) => app.MapGet();
        }
        """;

    private static CSharpAnalyzerTest<JourneyCoversWriteAnalyzer, DefaultVerifier> Make(
        string source, string journeys) =>
        new()
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState =
            {
                Sources =
                {
                    ("Harness.cs", """
                        sealed class SliceAttribute : System.Attribute { }
                        public sealed class Endpoints
                        {
                            public void MapGet() { }
                            public void MapPost() { }
                        }
                        """),
                    ("Deposit.cs", source),
                },
                AdditionalFiles = { ("WalletFlow.Tests.cs", journeys) },
            },
        };
}
