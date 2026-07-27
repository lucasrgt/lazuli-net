using Skies.Framework.Abstractions;

namespace Skies.Framework.Abstractions.Tests;

public class OrderedLifecycleTests
{
    // A sample step-ordered lifecycle (declaration order is the cursor order).
    private enum Step { A, B, C, Done }

    [Fact]
    public void Reached_is_true_at_or_past_the_step_and_false_before()
    {
        Assert.True(OrderedLifecycle.Reached(Step.B, Step.A));  // past
        Assert.True(OrderedLifecycle.Reached(Step.B, Step.B));  // at
        Assert.False(OrderedLifecycle.Reached(Step.A, Step.B)); // before — no skipping ahead
    }

    [Fact]
    public void Advance_moves_forward_from_exactly_the_current_step()
    {
        Assert.Equal(Step.B, OrderedLifecycle.Advance(Step.A, Step.A, Step.B));
    }

    [Fact]
    public void Advance_does_not_regress_an_already_completed_step()
    {
        // Re-editing step A while the cursor is at C must not pull it back to B.
        Assert.Equal(Step.C, OrderedLifecycle.Advance(Step.C, Step.A, Step.B));
    }

    [Fact]
    public void Advance_is_a_noop_when_the_cursor_is_not_at_the_step()
    {
        Assert.Equal(Step.A, OrderedLifecycle.Advance(Step.A, Step.B, Step.C));
    }
}
