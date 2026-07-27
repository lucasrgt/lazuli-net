namespace AeroFortress.Framework.Cli;

/// <summary>Defines the versioned Wake Me When project protocol.</summary>
internal static class WmwProject
{
    /// <summary>Require the deferment store, skill, and agent instructions.</summary>
    internal static FoundationProject.Outcome Check(string root) =>
        FoundationProject.Check(
            root,
            WmwCommand.Tool,
            "<!-- wmw:instructions:start -->",
            [".wmw/SKILL.md"],
            [".wmw/deferments"],
            ["wake", "resolve", "collect", "check"]);
}
