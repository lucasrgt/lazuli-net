namespace Skies.Framework.Cli;

/// <summary>Runs Not You Again through the Skies-pinned CSM bundle.</summary>
internal static class NyaCommand
{
    /// <summary>Execute NYA with every argument passed after <c>skies nya</c>.</summary>
    public static int Run(string[] arguments) => CsmCommand.RunTool("nya", arguments);

    internal static FoundationTool.Execution Capture(string[] arguments) =>
        CsmCommand.CaptureTool("nya", arguments);
}
