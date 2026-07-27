using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class GateScanTests
{
    [Fact]
    public void ScanProofs_finds_the_criterion_its_class_and_its_method()
    {
        var root = NewDir();
        Write(root, "Withdraw.Avp.Tests.cs", """
            namespace Sample.Tests.Modules.Wallets;

            public class WithdrawAvpProof
            {
                [AVP(typeof(Withdraw), "idempotency-key-honored")]
                [Integration]
                [Fact]
                public async Task Withdraw_honors_the_idempotency_key()
                {
                }
            }
            """);

        var proof = Assert.Single(GateScan.ScanProofs(root));

        Assert.Equal("Wallets", proof.Module);
        Assert.Equal("Withdraw", proof.Subject);
        Assert.Equal("idempotency-key-honored", proof.CriterionId);
        Assert.Equal("Sample.Tests.Modules.Wallets.WithdrawAvpProof", proof.ClassName);
        Assert.Equal("Withdraw_honors_the_idempotency_key", proof.Method);
    }

    [Fact]
    public void ScanProofs_never_walks_into_dependency_or_build_dirs()
    {
        var root = NewDir();
        Write(Path.Combine(root, "node_modules", "pkg"), "Dep.cs", "[AVP(\"from-a-dependency\")] class D {}");
        Write(Path.Combine(root, "bin", "Debug"), "Out.cs", "[AVP(\"from-build-output\")] class O {}");

        Assert.Empty(GateScan.ScanProofs(root));
    }

    [Fact]
    public void An_unbound_marker_is_not_an_avp_proof()
    {
        var root = NewDir();
        Write(root, "Unbound.cs", "class Proof { [AVP(\"criterion\")] void Check() { } }");

        Assert.Empty(GateScan.ScanProofs(root));
    }

    [Fact]
    public void Attribute_examples_inside_strings_never_mint_proofs_or_slices()
    {
        var root = NewDir();
        Write(root, "Fixture.cs", """"
            namespace Sample.Tests;

            public static class Fixture
            {
                public const string Source = """
                    namespace Imaginary.Modules.Wallets;
                    [Slice]
                    public static class Withdraw { }
                    public class Proof
                    {
                        [AVP(typeof(Withdraw), "idempotency-key-honored")]
                        public async Task Proves() { }
                    }
                    """;
            }
            """");

        Assert.Empty(GateScan.ScanProofs(root));
        Assert.Empty(GateScan.ScanSlices(root));
    }

    [Fact]
    public void ScanSlices_reads_the_attribute_block_and_the_namespace_module()
    {
        var root = NewDir();
        Write(root, "Withdraw.cs", """
            namespace Sample.Api.Modules.Wallets;

            /// <summary>Withdraw money.</summary>
            [Slice]
            public static class Withdraw
            {
            }
            """);
        Write(root, "Plain.cs", """
            namespace Sample.Api.Modules.Wallets;

            public static class NotASlice
            {
            }
            """);

        var slice = Assert.Single(GateScan.ScanSlices(root));

        Assert.Equal(("Wallets", "Withdraw"), (slice.Module, slice.Name));
    }

    [Fact]
    public void An_attribute_name_mentioned_in_prose_does_not_mint_a_slice()
    {
        var root = NewDir();
        Write(root, "HypothesizeMaterial.cs", """
            namespace Fluxo.Api.Modules.Catalog;

            /// <summary>Read-only hypothesis.</summary>
            [Slice]
            public static class HypothesizeMaterial
            {
            }
            """);
        Write(root, "Prose.cs", """
            namespace Fluxo.Api.Modules.Catalog;

            // This helper explains what a [Slice] is, but is not one.
            public static class JustProse
            {
            }
            """);

        var slice = Assert.Single(GateScan.ScanSlices(root));

        Assert.Equal("HypothesizeMaterial", slice.Name);
    }

    [Fact]
    public void DiscoverManifests_parses_the_wellformed_and_reports_the_malformed()
    {
        var root = NewDir();
        Write(root, "Wallets.spec.toml", """
            module = "Wallets"
            [slices.Withdraw]
            criteria = ["idempotency-key-honored"]
            """);
        Write(root, "Broken.spec.toml", "just some text with no module key");

        var manifests = GateScan.DiscoverManifests(root);

        var wallets = Assert.Single(manifests, m => m.Manifest is not null);
        Assert.Equal("Wallets", wallets.Manifest!.Module);
        Assert.Equal(new[] { "idempotency-key-honored" }, wallets.Manifest.Slices["Withdraw"]);
        var broken = Assert.Single(manifests, m => m.Manifest is null);
        Assert.NotNull(broken.Error);
    }

    [Fact]
    public void DiscoverManifests_ignores_scaffolding_templates()
    {
        var root = NewDir();
        Write(Path.Combine(root, "templates", "starter"), "Health.spec.toml", """
            module = "Health"
            [slices.Ping]
            criteria = ["echoes-input"]
            """);

        Assert.Empty(GateScan.DiscoverManifests(root));
    }

    [Fact]
    public void ParseTrxDirectory_joins_definitions_to_results()
    {
        var dir = NewDir();
        Write(dir, "run.trx", """
            <?xml version="1.0" encoding="UTF-8"?>
            <TestRun xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">
              <Results>
                <UnitTestResult testId="one" outcome="Passed" />
                <UnitTestResult testId="two" outcome="Failed" />
              </Results>
              <TestDefinitions>
                <UnitTest id="one">
                  <TestMethod className="Sample.Tests.WithdrawAvpProof, Sample.Tests" name="Honors_the_key" />
                </UnitTest>
                <UnitTest id="two">
                  <TestMethod className="Sample.Tests.DepositAvpProof" name="Never_overdraws" />
                </UnitTest>
              </TestDefinitions>
            </TestRun>
            """);

        var verdicts = GateScan.ParseTrxDirectory(dir);

        Assert.Equal(2, verdicts.Count);
        Assert.Contains(verdicts, v =>
            v is { ClassName: "Sample.Tests.WithdrawAvpProof", Method: "Honors_the_key", Outcome: "Passed" });
        Assert.Contains(verdicts, v =>
            v is { ClassName: "Sample.Tests.DepositAvpProof", Method: "Never_overdraws", Outcome: "Failed" });
    }

    private static string NewDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "skies-gate-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static void Write(string dir, string name, string content)
    {
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, name), content);
    }
}
