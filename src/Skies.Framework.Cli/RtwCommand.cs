namespace Skies.Framework.Cli;

/// <summary>Runs Right This Way through the Skies-pinned CSM bundle.</summary>
internal static class RtwCommand
{
    /// <summary>Execute RTW with every argument passed after <c>skies rtw</c>.</summary>
    public static int Run(string[] arguments) => CsmCommand.RunTool("rtw", arguments);

    internal static FoundationTool.Execution Capture(string[] arguments) =>
        CsmCommand.CaptureTool("rtw", arguments);
}
