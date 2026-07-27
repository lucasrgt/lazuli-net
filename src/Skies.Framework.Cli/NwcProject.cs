namespace Skies.Framework.Cli;

/// <summary>Defines the versioned Now We Can project protocol.</summary>
internal static class NwcProject
{
    /// <summary>Require the deferment store, skill, and agent instructions.</summary>
    internal static FoundationProject.Outcome Check(string root) =>
        FoundationProject.Check(
            root,
            NwcCommand.Tool,
            [".nwc/SKILL.md"],
            [".nwc/deferments"],
            ["wake", "resolve", "collect", "check"]);
}
