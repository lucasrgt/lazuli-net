namespace Skies.Framework.SelfHarness.Tests;

public class CommentHygieneAnalyzerTests
{
    [Fact]
    public Task Clean_comment_reports_nothing() =>
        Harness<CommentHygieneAnalyzer>.Verify(Clean);

    [Fact]
    public Task Todo_marker_is_flagged() =>
        Harness<CommentHygieneAnalyzer>.Verify(Todo);

    [Fact]
    public Task Tracking_code_is_flagged() =>
        Harness<CommentHygieneAnalyzer>.Verify(TrackingCode);

    private const string Clean = """
        // a perfectly ordinary explanation
        public class C { }
        """;

    private const string Todo = """
        {|SKYSELF002:// TODO clean this up later|}
        public class C { }
        """;

    private const string TrackingCode = """
        {|SKYSELF002:// see JIRA-123 for the rationale|}
        public class C { }
        """;
}
