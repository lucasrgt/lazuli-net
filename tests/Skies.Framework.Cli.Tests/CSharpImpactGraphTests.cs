using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public sealed class CSharpImpactGraphTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("skies-csharp-impact-").FullName;

    [Fact]
    public void Slice_contract_names_do_not_connect_unrelated_features()
    {
        Write("Withdraw.cs", """
            namespace App;
            public static class Withdraw {
                public record Input(int Amount);
                public record Output(int Balance);
                public static Output Handle(Input input) => new(input.Amount);
            }
            """);
        Write("Login.cs", """
            namespace App;
            public static class Login {
                public record Input(string Email);
                public record Output(string Token);
                public static Output Handle(Input input) => new(input.Email);
            }
            """);
        Write("WithdrawTests.cs", "class WithdrawTests { object Run() => App.Withdraw.Handle(new(2)); }");
        Write("LoginTests.cs", "class LoginTests { object Run() => App.Login.Handle(new(\"a\")); }");

        var impacted = CSharpImpactGraph.Build(_root).Expand("Withdraw.cs");

        Assert.Contains("WithdrawTests.cs", impacted);
        Assert.DoesNotContain("Login.cs", impacted);
        Assert.DoesNotContain("LoginTests.cs", impacted);
    }

    [Fact]
    public void A_nested_type_consumer_remains_affected_through_its_declaring_type()
    {
        Write("Withdraw.cs", "namespace App; public class Withdraw { public record Input(int Amount); }");
        Write("Alias.cs", "using Request = App.Withdraw.Input; class Alias { Request value; }");
        Write("Static.cs", "using static App.Withdraw; class Static { Input value; }");
        Write("Qualified.cs", "class Qualified { App.Withdraw.Input value; }");

        var impacted = CSharpImpactGraph.Build(_root).Expand("Withdraw.cs");

        Assert.Equal(new[] { "Alias.cs", "Qualified.cs", "Static.cs", "Withdraw.cs" }, impacted.Order());
    }

    [Fact]
    public void Changing_a_partial_type_reaches_consumers_of_its_other_parts()
    {
        Write("Wallet.cs", "public partial class Wallet { public int Balance; }");
        Write("Wallet.Input.cs", "public partial class Wallet { public record Input(int Amount); }");
        Write("WalletTests.cs", "class WalletTests { Wallet.Input input; }");

        var impacted = CSharpImpactGraph.Build(_root).Expand("Wallet.Input.cs");

        Assert.Contains("WalletTests.cs", impacted);
    }

    [Fact]
    public void A_namespace_segment_is_not_a_reference_to_a_composition_class()
    {
        Write("Withdraw.cs", "namespace App.Modules.Wallets; public class Withdraw {}");
        Write("WalletsModule.cs", "namespace App.Modules.Wallets; public class WalletsModule { Withdraw slice; }");
        Write("Modules.cs", "namespace App.Modules; public class Modules { Wallets.WalletsModule module; }");
        Write("Login.cs", "namespace App.Modules.Account; public class Login {}");
        Write("LoginTests.cs", "using App.Modules.Account; class LoginTests { App.Modules.Account.Login slice; }");
        Write("AppDb.cs", "namespace App; public class AppDb { Modules.Account.Login row; }");

        var impacted = CSharpImpactGraph.Build(_root).Expand("Withdraw.cs");

        Assert.Contains("Modules.cs", impacted);
        Assert.DoesNotContain("Login.cs", impacted);
        Assert.DoesNotContain("LoginTests.cs", impacted);
        Assert.DoesNotContain("AppDb.cs", impacted);
    }

    [Fact]
    public void A_type_with_the_same_short_name_as_a_namespace_keeps_its_consumers()
    {
        Write("Wallet.cs", "namespace App; public class Wallet { public static int Balance; }");
        Write("Unrelated.cs", "namespace Other.Wallet; public class Unrelated {}");
        Write("WalletTests.cs", "using App; class WalletTests { int Run() => Wallet.Balance; }");

        var impacted = CSharpImpactGraph.Build(_root).Expand("Wallet.cs");

        Assert.Contains("WalletTests.cs", impacted);
        Assert.DoesNotContain("Unrelated.cs", impacted);
    }

    [Fact]
    public void A_row_property_named_Program_is_not_a_dependency_on_the_entrypoint()
    {
        Write("Program.cs", "namespace App; public class Program { public static void Start() {} }");
        Write("HostTests.cs", "class HostTests { void Run() => App.Program.Start(); }");
        Write("Export.cs", "class Row { public string Program; } class Export { string Run(Row row) => row.Program; }");

        var impacted = CSharpImpactGraph.Build(_root).Expand("Program.cs");

        Assert.Contains("HostTests.cs", impacted);
        Assert.DoesNotContain("Export.cs", impacted);
    }

    [Fact]
    public void Extension_method_calls_keep_their_dependency_edges()
    {
        Write("MoneyExtensions.cs", "static class MoneyExtensions { public static int Cents(this decimal value) => 1; }");
        Write("Withdraw.cs", "class Withdraw { int Run(decimal amount) => amount.Cents(); }");

        Assert.Contains("Withdraw.cs", CSharpImpactGraph.Build(_root).Expand("MoneyExtensions.cs"));
    }

    [Fact]
    public void A_global_static_import_preserves_consumers_of_unqualified_nested_types()
    {
        Write("Wallet.cs", "namespace App; public class Wallet { public record Input(int Amount); }");
        Write("GlobalUsings.cs", "global using static App.Wallet;");
        Write("WalletTests.cs", "class WalletTests { Input input; }");

        Assert.Contains("WalletTests.cs", CSharpImpactGraph.Build(_root).Expand("Wallet.cs"));
    }

    [Fact]
    public void Shared_domain_changes_still_reach_all_real_transitive_consumers()
    {
        Write("Money.cs", "public record Money(int Cents);");
        Write("Wallet.cs", "public class Wallet { public Money Balance; }");
        Write("Withdraw.cs", "public class Withdraw { Wallet wallet; }");
        Write("WithdrawTests.cs", "class WithdrawTests { Withdraw operation; }");
        Write("Login.cs", "class Login { string email; }");

        var impacted = CSharpImpactGraph.Build(_root).Expand("Money.cs");

        Assert.Equal(new[] { "Money.cs", "Wallet.cs", "Withdraw.cs", "WithdrawTests.cs" }, impacted.Order());
    }

    private void Write(string path, string source) => File.WriteAllText(Path.Combine(_root, path), source);

    public void Dispose() => Directory.Delete(_root, recursive: true);
}
