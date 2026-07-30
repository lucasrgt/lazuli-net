using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class FoundationWorkflowCommandTests
{
    [Fact]
    public void Context_builds_one_bounded_primary_agent_retrieval()
    {
        Assert.True(FoundationWorkflowCommand.TryParse(
            [
                "--task", "Add retry status",
                "--path", "src/status.ts",
                "--path", "tests/status.test.ts",
                "--event", "dependency:retry-ready",
                "--limit", "6",
            ],
            allowGateMode: false,
            out var request,
            out var error), error);

        var steps = FoundationWorkflowCommand.ContextPlan(request!);

        Assert.Equal(["wtw", "rtw", "nya", "nwc"], steps.Select(step => step.Id));
        Assert.All(steps.Take(3), step =>
        {
            Assert.Contains("Add retry status", step.Arguments);
            Assert.Contains("src/status.ts", step.Arguments);
            Assert.Contains("tests/status.test.ts", step.Arguments);
            Assert.Contains("6", step.Arguments);
        });
        Assert.Contains("dependency:retry-ready", steps[3].Arguments);
    }

    [Fact]
    public void Check_composes_avp_and_every_semantic_gate()
    {
        Assert.True(FoundationWorkflowCommand.TryParse(
            ["--task", "Review retry status", "--base", "origin/main", "--fast"],
            allowGateMode: true,
            out var request,
            out var error), error);

        var steps = FoundationWorkflowCommand.CheckPlan(request!);

        Assert.Equal(["gate", "wtw", "rtw", "nya", "nwc"], steps.Select(step => step.Id));
        Assert.Equal(["--affected", "--fast", "--base", "origin/main"], steps[0].Arguments);
        Assert.All(steps.Skip(1).Take(3), step =>
        {
            Assert.Contains("--task", step.Arguments);
            Assert.Contains("--base", step.Arguments);
            Assert.Contains("origin/main", step.Arguments);
        });
    }

    [Fact]
    public void Staged_check_is_always_bounded_even_when_the_caller_omits_fast()
    {
        Assert.True(FoundationWorkflowCommand.TryParse(
            ["--task", "Review staged work", "--staged"],
            allowGateMode: true,
            out var request,
            out var error), error);

        var gate = FoundationWorkflowCommand.CheckPlan(request!)[0];

        Assert.Equal(["--staged", "--fast"], gate.Arguments);
    }

    [Fact]
    public void An_ambiguous_check_fails_before_any_expensive_gate_starts()
    {
        var calls = 0;
        var code = FoundationWorkflowCommand.Check(
            ["--task", "finish work"],
            (_, _) =>
            {
                calls++;
                return 0;
            },
            TextWriter.Null,
            TextWriter.Null);

        Assert.Equal(2, code);
        Assert.Equal(0, calls);
    }

    [Theory]
    [InlineData("--full", "--fast")]
    [InlineData("--full", "--staged")]
    [InlineData("--staged", "--base")]
    [InlineData("--affected", "--base")]
    public void Contradictory_review_scopes_fail_closed(string first, string second)
    {
        var arguments = second == "--base"
            ? new[] { "--task", "review", first, second, "main" }
            : new[] { "--task", "review", first, second };

        Assert.False(FoundationWorkflowCommand.TryParse(
            arguments,
            allowGateMode: true,
            out _,
            out _));
    }

    [Theory]
    [InlineData()]
    [InlineData("--task")]
    [InlineData("--task", "work", "--unknown")]
    [InlineData("--task", "work", "--limit", "0")]
    [InlineData("--task", "work", "--limit", "25")]
    public void Invalid_context_never_runs_a_foundation(params string[] arguments)
    {
        var calls = 0;
        var code = FoundationWorkflowCommand.Context(
            arguments,
            (_, _) =>
            {
                calls++;
                return 0;
            },
            TextWriter.Null,
            TextWriter.Null);

        Assert.Equal(2, code);
        Assert.Equal(0, calls);
    }

    [Fact]
    public void Every_step_runs_even_when_an_earlier_gate_finds_a_problem()
    {
        var calls = new List<string>();
        var code = FoundationWorkflowCommand.Check(
            ["--task", "finish work", "--staged"],
            (id, _) =>
            {
                calls.Add(id);
                return id switch { "gate" => 1, "rtw" => 2, _ => 0 };
            },
            TextWriter.Null,
            TextWriter.Null);

        Assert.Equal(2, code);
        Assert.Equal(["gate", "wtw", "rtw", "nya", "nwc"], calls);
    }

    [Fact]
    public void Help_is_safe_and_does_not_run_repository_discovery()
    {
        var calls = 0;
        var output = new StringWriter();

        var code = FoundationWorkflowCommand.Check(
            ["--help"],
            (_, _) =>
            {
                calls++;
                return 0;
            },
            output,
            TextWriter.Null);

        Assert.Equal(0, code);
        Assert.Equal(0, calls);
        Assert.Contains("skies check --task", output.ToString());
    }

    [Fact]
    public void Wtw_context_omits_graph_bulk_but_keeps_governing_statements()
    {
        var output = new StringWriter();
        FoundationWorkflowCommand.WriteBounded(
            "wtw",
            """
            {
              "records": [{
                "id": "server-authority",
                "kind": "invariant",
                "title": "Keep pricing server authoritative",
                "statement": "Clients never calculate authoritative totals.",
                "violation": "A client submits its own accepted total.",
                "evidence": ["large evidence payload"]
              }],
              "edges": [{"from": "a", "to": "b"}]
            }
            """,
            output);

        var text = output.ToString();
        Assert.Contains("Keep pricing server authoritative", text);
        Assert.Contains("Clients never calculate", text);
        Assert.Contains("violation:", text);
        Assert.DoesNotContain("large evidence payload", text);
        Assert.DoesNotContain("\"edges\"", text);
    }

    [Fact]
    public void Scar_context_keeps_the_corrected_lesson_without_occurrence_history()
    {
        var output = new StringWriter();
        FoundationWorkflowCommand.WriteBounded(
            "nya",
            """
            [{
              "id": "NYA-1",
              "title": "Magic color repeated",
              "lesson": "Use the semantic design token.",
              "occurrences": [{"source": "large history"}]
            }]
            """,
            output);

        var text = output.ToString();
        Assert.Contains("NYA-1", text);
        Assert.Contains("Use the semantic design token.", text);
        Assert.DoesNotContain("large history", text);
    }
}
