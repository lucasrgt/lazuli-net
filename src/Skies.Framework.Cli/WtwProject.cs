namespace Skies.Framework.Cli;

/// <summary>Defines the versioned Why This Way project protocol.</summary>
internal static class WtwProject
{
    /// <summary>Require the decision and invariant stores, skill, and agent instructions.</summary>
    internal static FoundationProject.Outcome Check(string root) =>
        FoundationProject.Check(
            root,
            WtwCommand.Tool,
            [".agent-first/wtw/SKILL.md"],
            [
                ".agent-first/wtw/records/decisions",
                ".agent-first/wtw/records/invariants",
            ],
            ["explain", "collect", "guard"]);
}
