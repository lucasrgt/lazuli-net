using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public sealed class FrontendGateTests
{
    [Fact]
    public void A_full_flutter_library_gate_cannot_pass_without_any_executable_proof()
    {
        var workspace = Directory.CreateTempSubdirectory("skies-empty-flutter-").FullName;
        try
        {
            Write(workspace, "pubspec.yaml", "name: empty_library\n");
            Write(workspace, "lib/value.dart", "const value = 1;\n");
            var package = new FrontendPackage(workspace, FrontendPackageRole.Library, FrontendPlatform.Flutter);
            Assert.Equal(1, FrontendGate.RunFlutterTests(workspace, new FrontendImpact(package) { Full = true }));
            Write(workspace, "test/value.assay_test.dart", "void main() {}\n");
            Assert.Equal(0, FrontendGate.RunFlutterTests(workspace, new FrontendImpact(package) { Full = true }));
        }
        finally
        {
            Directory.Delete(workspace, recursive: true);
        }
    }

    [Fact]
    public void Static_surface_without_viewmodels_does_not_require_assay()
    {
        var workspace = Directory.CreateTempSubdirectory("skies-frontend-gate-").FullName;
        try
        {
            Write(workspace, "src/pages/index.astro", "<h1>Static surface</h1>");

            Assert.False(FrontendGate.RequiresAssay(workspace));
        }
        finally
        {
            Directory.Delete(workspace, recursive: true);
        }
    }

    [Theory]
    [InlineData("src/features/Bookings.viewModel.ts")]
    [InlineData("src/features/Bookings.viewModel.tsx")]
    [InlineData("src/features/Bookings.assay.test.tsx")]
    public void Viewmodels_and_explicit_assay_suites_require_assay(string relativePath)
    {
        var workspace = Directory.CreateTempSubdirectory("skies-frontend-gate-").FullName;
        try
        {
            Write(workspace, relativePath, "export {};");

            Assert.True(FrontendGate.RequiresAssay(workspace));
        }
        finally
        {
            Directory.Delete(workspace, recursive: true);
        }
    }

    [Theory]
    [InlineData("lib/features/bookings/bookings_view_model.dart")]
    [InlineData("test/features/bookings/bookings.assay_test.dart")]
    public void Flutter_viewmodels_and_assay_suites_require_executable_avp(string relativePath)
    {
        var workspace = Directory.CreateTempSubdirectory("skies-flutter-gate-").FullName;
        try
        {
            Write(workspace, "pubspec.yaml", "name: sample\n");
            Write(workspace, relativePath, "void main() {}\n");

            Assert.True(FrontendGate.RequiresAssay(workspace));
        }
        finally
        {
            Directory.Delete(workspace, recursive: true);
        }
    }

    private static void Write(string workspace, string relativePath, string content)
    {
        var path = Path.Combine(workspace, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
    }
}
