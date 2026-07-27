using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class TestInfraPurityAnalyzerTests
{
    // A [Fact] stub so the source builds without an xUnit reference (the analyzer matches by simple name).
    private const string FactStub = "\nsealed class FactAttribute : System.Attribute { }\n";

    [Fact]
    public Task A_test_co_located_under_src_is_fine()
    {
        var test = new CSharpAnalyzerTest<TestInfraPurityAnalyzer, DefaultVerifier>
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState =
            {
                Sources =
                {
                    ("src/Modules/Wallets/Slices/Deposit.Tests.cs",
                        "class DepositTests { [Fact] public void Deposits_money() { } }" + FactStub),
                },
            },
        };
        return test.RunAsync();
    }

    [Fact]
    public Task A_test_authored_in_the_test_project_is_flagged()
    {
        var test = new CSharpAnalyzerTest<TestInfraPurityAnalyzer, DefaultVerifier>
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState =
            {
                Sources =
                {
                    ("tests/App.Tests/StrayTests.cs",
                        "class StrayTests { [Fact] public void {|SKY0011:Deposits_money|}() { } }" + FactStub),
                },
            },
        };
        return test.RunAsync();
    }

    [Fact]
    public Task Infrastructure_without_a_test_attribute_is_fine()
    {
        var test = new CSharpAnalyzerTest<TestInfraPurityAnalyzer, DefaultVerifier>
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.Errors,
            TestState =
            {
                Sources =
                {
                    ("tests/App.Tests/TestApp.cs", "class TestApp { public void SwapStores() { } }"),
                },
            },
        };
        return test.RunAsync();
    }
}
