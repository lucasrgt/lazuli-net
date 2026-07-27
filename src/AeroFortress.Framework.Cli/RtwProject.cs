namespace AeroFortress.Framework.Cli;

/// <summary>Defines the versioned Right This Way project protocol.</summary>
internal static class RtwProject
{
    /// <summary>Require the proven-way store, skill, and agent instructions.</summary>
    internal static FoundationProject.Outcome Check(string root) =>
        FoundationProject.Check(
            root,
            RtwCommand.Tool,
            "<!-- rtw:instructions:start -->",
            [".rtw/SKILL.md"],
            [".rtw/ways"],
            ["guide", "add", "check"]);
}
