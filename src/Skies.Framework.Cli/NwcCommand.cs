namespace Skies.Framework.Cli;

/// <summary>Runs Now We Can through the Skies-pinned CSM bundle.</summary>
internal static class NwcCommand
{
    /// <summary>Execute NWC with every argument passed after <c>skies nwc</c>.</summary>
    public static int Run(string[] arguments) => CsmCommand.RunTool("nwc", arguments);

    internal static FoundationTool.Execution Capture(string[] arguments) =>
        CsmCommand.CaptureTool("nwc", arguments);
}
