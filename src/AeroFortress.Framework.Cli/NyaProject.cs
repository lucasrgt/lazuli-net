namespace AeroFortress.Framework.Cli;

/// <summary>Defines the versioned Not You Again project protocol.</summary>
internal static class NyaProject
{
    /// <summary>Require the scar store, skill, shared policy, and agent instructions.</summary>
    internal static FoundationProject.Outcome Check(string root) =>
        FoundationProject.Check(
            root,
            NyaCommand.Tool,
            "<!-- nya:instructions:start -->",
            [".nya/config.toml", ".nya/SKILL.md"],
            [".nya/scars"],
            ["recall", "spec", "check", "replay"]);
}
