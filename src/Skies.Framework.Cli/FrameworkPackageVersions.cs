namespace Skies.Framework.Cli;

/// <summary>
/// Package versions emitted by the CLI scaffolds. Keeping the framework package line in one place prevents
/// generators from silently stamping historical versions into otherwise-current applications.
/// </summary>
internal static class FrameworkPackageVersions
{
    /// <summary>The current Skies.Framework.* release consumed by generated applications.</summary>
    public const string Framework = "4.1.2";

    /// <summary>The Assay.Net protocol implementation required by generated applications and the gate.</summary>
    public const string Assay = "0.4.0";
}
