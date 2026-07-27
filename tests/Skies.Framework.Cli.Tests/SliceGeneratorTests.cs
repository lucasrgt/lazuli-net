using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class SliceGeneratorTests
{
    [Fact]
    public void Generates_a_slice_in_the_canonical_shape()
    {
        var root = NewProject("Shop.Api");

        var code = SliceGenerator.Generate(root, "Orders", "Place", verify: ["my-domain-invariant"]);

        Assert.Equal(0, code);
        var slice = File.ReadAllText(Path.Combine(root, "Modules", "Orders", "Slices", "Place.cs"));
        Assert.Contains("namespace Shop.Api.Modules.Orders;", slice);
        Assert.Contains("[Slice]", slice);
        Assert.Contains("public static class Place", slice);
        Assert.Contains("public record Input", slice);
        Assert.Contains("public record Output", slice);
        Assert.Contains("Task<Result<Output>> Handle", slice);
        Assert.Contains("void Map(", slice);

        // The endpoint is named after the slice (SKY0012) — the operationId the typed client hooks from.
        Assert.Contains(".WithName(nameof(Place))", slice);

        // The scaffolded validation uses the accumulator's sugar with a registry constant (SKY0018), and the
        // module's registry is created with it.
        Assert.Contains(".Require(input.Id, \"id\", OrdersErrorCodes.IdRequired)", slice);
        var registry = File.ReadAllText(Path.Combine(root, "Modules", "Orders", "OrdersErrorCodes.cs"));
        Assert.Contains("public const string IdRequired = \"id.required\";", registry);

        // Canonical order: Input → Output → Handle → Map, the same order SKY0001 enforces.
        Assert.True(slice.IndexOf("record Input", StringComparison.Ordinal)
                  < slice.IndexOf("record Output", StringComparison.Ordinal));
        Assert.True(slice.IndexOf("record Output", StringComparison.Ordinal)
                  < slice.IndexOf("Handle", StringComparison.Ordinal));
        Assert.True(slice.IndexOf("Handle", StringComparison.Ordinal)
                  < slice.IndexOf("void Map", StringComparison.Ordinal));
    }

    [Fact]
    public void Generates_a_co_located_unit_test()
    {
        var root = NewProject("Shop.Api");

        SliceGenerator.Generate(root, "Orders", "Place", verify: ["my-domain-invariant"]);

        var test = File.ReadAllText(Path.Combine(root, "Modules", "Orders", "Slices", "Place.Tests.cs"));
        Assert.Contains("namespace Shop.Tests.Modules.Orders;", test);
        Assert.Contains("using Shop.Api.Modules.Orders;", test);
        Assert.Contains("[Unit]", test);
        Assert.Contains("public class PlaceTests", test);
    }

    [Fact]
    public void Refuses_to_overwrite_an_existing_slice()
    {
        var root = NewProject("Shop.Api");

        Assert.Equal(0, SliceGenerator.Generate(root, "Orders", "Place", verify: ["my-domain-invariant"]));
        Assert.Equal(1, SliceGenerator.Generate(root, "Orders", "Place", verify: ["my-domain-invariant"]));
    }

    [Fact]
    public void A_generated_write_gets_complete_journeys()
    {
        var root = NewProject("Shop.Api");

        SliceGenerator.Generate(root, "Orders", "Place", verify: ["my-domain-invariant"]);

        var journey = File.ReadAllText(Path.Combine(root, "Journeys", "PlaceJourney.Tests.cs"));
        Assert.Contains("namespace Shop.Tests.Journeys;", journey);
        Assert.Contains("[Journey(typeof(Place), JourneyPath.Happy)]", journey);
        Assert.Contains("[Journey(typeof(Place), JourneyPath.Sad)]", journey);
    }

    [Fact]
    public void Verify_declares_the_criteria_and_scaffolds_the_red_proof()
    {
        var root = NewProject("Shop.Api");

        var code = SliceGenerator.Generate(root, "Wallets", "Withdraw", verify: ["idempotency-key-honored"]);

        Assert.Equal(0, code);

        // The obligation: the module manifest declares the slice with the criterion (what SKY0031 wants),
        // and the file is exactly what the doctor/Assay.Net readers parse.
        var manifestPath = Path.Combine(root, "Modules", "Wallets", "Wallets.spec.toml");
        var manifest = Assay.Net.SpecManifest.Load(manifestPath);
        Assert.Equal("Wallets", manifest.Module);
        Assert.Equal(new[] { "idempotency-key-honored" }, manifest.Slices["Withdraw"]);

        // The proof: co-located, anchored with [AVP] (what SKY0030 scans), wired to the right archetype,
        // and red by design (the subject factory throws until the real endpoint is bound).
        var proof = File.ReadAllText(Path.Combine(root, "Modules", "Wallets", "Slices", "Withdraw.Avp.Tests.cs"));
        Assert.Contains("namespace Shop.Tests.Modules.Wallets;", proof);
        Assert.Contains("[AVP(typeof(Withdraw), \"idempotency-key-honored\")]", proof);
        Assert.Contains("new RequestIdempotency()", proof);
        Assert.Contains("RequestIdempotencySubject", proof);
        Assert.Contains("NotImplementedException", proof);
    }

    [Fact]
    public void An_off_catalog_criterion_still_gets_a_red_anchor_proof()
    {
        var root = NewProject("Shop.Api");

        SliceGenerator.Generate(root, "Orders", "Place", verify: ["my-domain-invariant"]);

        var proof = File.ReadAllText(Path.Combine(root, "Modules", "Orders", "Slices", "Place.Avp.Tests.cs"));
        Assert.Contains("[AVP(typeof(Place), \"my-domain-invariant\")]", proof);
        Assert.Contains("Assert.Fail", proof);   // a proof that cannot fail must never ship
    }

    [Fact]
    public void Run_parses_the_verify_flag_and_rejects_unknown_ones()
    {
        // Run() reads the current directory, so pin it to a fresh project for the duration.
        var root = NewProject("Shop.Api");
        var before = Directory.GetCurrentDirectory();
        Directory.SetCurrentDirectory(root);
        try
        {
            Assert.Equal(0, SliceGenerator.Run("Wallets", "Withdraw", ["--verify", "idempotency-key-honored"]));
            Assert.True(File.Exists(Path.Combine(root, "Modules", "Wallets", "Wallets.spec.toml")));

            Assert.Equal(1, SliceGenerator.Run("Wallets", "Deposit", []));              // criteria are mandatory
            Assert.Equal(1, SliceGenerator.Run("Wallets", "Deposit", ["--verify"]));      // missing the id list
            Assert.Equal(1, SliceGenerator.Run("Wallets", "Deposit", ["--nonsense"]));    // unknown flag
        }
        finally
        {
            Directory.SetCurrentDirectory(before);
        }
    }

    private static string NewProject(string name)
    {
        var root = Directory.CreateTempSubdirectory("skies-framework-cli-test").FullName;
        File.WriteAllText(Path.Combine(root, name + ".csproj"), "<Project />");
        return root;
    }
}
