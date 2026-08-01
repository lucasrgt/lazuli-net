namespace Skies.Framework.Cli;

/// <summary>Runs Why This Way through the Skies-pinned CSM bundle.</summary>
internal static class WtwCommand
{
    /// <summary>Execute WTW with every argument passed after <c>skies wtw</c>.</summary>
    public static int Run(string[] arguments) => CsmCommand.RunTool("wtw", arguments);

    internal static FoundationTool.Execution Capture(string[] arguments) =>
        CsmCommand.CaptureTool("wtw", arguments);
}
