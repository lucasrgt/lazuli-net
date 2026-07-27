using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

namespace Skies.Framework.Doctor.Tests;

public class WriteConcurrencyAnalyzerTests
{
    [Fact]
    public Task Write_against_a_tokened_entity_reports_nothing() =>
        Make("Slice.cs", """
            namespace Demo.Modules.Wallets;

            [Slice]
            static class Deposit
            {
                static void Handle(Demo.AppDb db)
                {
                    var w = db.Wallets.Find();
                    w.Balance += 10;
                    db.SaveChanges();
                }
            }
            """, walletExtra: "public decimal Balance { get; set; } public byte[] RowVersion { get; private set; }").RunAsync();

    [Fact]
    public Task Write_against_a_tokenless_entity_is_flagged()
    {
        var test = Make("Slice.cs", """
            namespace Demo.Modules.Wallets;

            [Slice]
            static class Deposit
            {
                static void Handle(Demo.AppDb db)
                {
                    var w = db.Wallets.Find();
                    w.Balance += 10;
                    db.SaveChanges();
                }
            }
            """, walletExtra: "public decimal Balance { get; set; }");
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(WriteConcurrencyAnalyzer.DiagnosticId, DiagnosticSeverity.Warning)
                .WithSpan("Slice.cs", 4, 14, 4, 21)
                .WithArguments("Deposit", "Wallet"));
        return test.RunAsync();
    }

    [Fact]
    public Task Read_only_slice_reports_nothing() =>
        Make("Slice.cs", """
            namespace Demo.Modules.Wallets;

            [Slice]
            static class GetBalance
            {
                static void Handle(Demo.AppDb db)
                {
                    var w = db.Wallets.Find();
                }
            }
            """, walletExtra: "").RunAsync();

    [Fact]
    public Task A_read_beside_another_write_is_not_misclassified()
        => Make("Slice.cs", """
            namespace Demo.Modules.Wallets;

            [Slice]
            static class OpenWallet
            {
                static void Handle(Demo.AppDb db)
                {
                    var existing = db.Wallets.Find();
                    db.Audits.Add(new Audit());
                    db.SaveChanges();
                }
            }
            """, walletExtra: "").RunAsync();

    [Fact]
    public Task An_insert_only_entity_does_not_need_an_optimistic_concurrency_token()
        => Make("Slice.cs", """
            namespace Demo.Modules.Wallets;

            [Slice]
            static class OpenWallet
            {
                static void Handle(Demo.AppDb db)
                {
                    db.Wallets.Add(new Wallet());
                    db.SaveChanges();
                }
            }
            """, walletExtra: "").RunAsync();

    [Fact]
    public Task A_domain_method_that_mutates_the_tracked_entity_is_flagged()
    {
        var test = Make("Slice.cs", """
            namespace Demo.Modules.Wallets;

            [Slice]
            static class Deposit
            {
                static void Handle(Demo.AppDb db)
                {
                    var w = db.Wallets.Find();
                    w.Deposit(10);
                    db.SaveChanges();
                }
            }
            """, walletExtra: "public decimal Balance { get; private set; } public void Deposit(decimal amount) => Balance += amount;");
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(WriteConcurrencyAnalyzer.DiagnosticId, DiagnosticSeverity.Warning)
                .WithSpan("Slice.cs", 4, 14, 4, 21)
                .WithArguments("Deposit", "Wallet"));
        return test.RunAsync();
    }

    [Fact]
    public Task A_read_only_domain_method_beside_an_insert_is_not_misclassified()
        => Make("Slice.cs", """
            namespace Demo.Modules.Wallets;

            [Slice]
            static class AuditWallet
            {
                static void Handle(Demo.AppDb db)
                {
                    var w = db.Wallets.Find();
                    _ = w.CanWithdraw(10);
                    db.Audits.Add(new Audit());
                    db.SaveChanges();
                }
            }
            """, walletExtra: "public decimal Balance { get; private set; } public bool CanWithdraw(decimal amount) => Balance >= amount;").RunAsync();

    [Fact]
    public Task An_explicit_update_is_this_rules_concern()
    {
        var test = Make("Slice.cs", """
            namespace Demo.Modules.Wallets;

            [Slice]
            static class Deposit
            {
                static void Handle(Demo.AppDb db)
                {
                    var w = db.Wallets.Find();
                    db.Wallets.Update(w);
                    db.SaveChanges();
                }
            }
            """, walletExtra: "");
        test.TestState.ExpectedDiagnostics.Add(
            new DiagnosticResult(WriteConcurrencyAnalyzer.DiagnosticId, DiagnosticSeverity.Warning)
                .WithSpan("Slice.cs", 4, 14, 4, 21)
                .WithArguments("Deposit", "Wallet"));
        return test.RunAsync();
    }

    private static CSharpAnalyzerTest<WriteConcurrencyAnalyzer, DefaultVerifier> Make(
        string sliceFile, string sliceSource, string walletExtra) =>
        new()
        {
            ReferenceAssemblies = ReferenceAssemblies.Net.Net80,
            CompilerDiagnostics = CompilerDiagnostics.None,
            TestState =
            {
                Sources =
                {
                    ("Harness.cs", $$"""
                        namespace Microsoft.EntityFrameworkCore
                        {
                            public class DbSet<T>
                            {
                                public T Find() => default!;
                                public void Add(T entity) { }
                                public void Update(T entity) { }
                            }
                        }
                        namespace Demo.Modules.Wallets
                        {
                            public class Wallet { {{walletExtra}} }
                            public class Audit { }
                        }
                        namespace Demo
                        {
                            public class AppDb
                            {
                                public Microsoft.EntityFrameworkCore.DbSet<Demo.Modules.Wallets.Wallet> Wallets => new();
                                public Microsoft.EntityFrameworkCore.DbSet<Demo.Modules.Wallets.Audit> Audits => new();
                                public void SaveChanges() { }
                            }
                        }
                        sealed class SliceAttribute : System.Attribute { }
                        """),
                    (sliceFile, sliceSource),
                },
            },
        };
}
