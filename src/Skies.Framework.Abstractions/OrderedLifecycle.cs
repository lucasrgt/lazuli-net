using System;
using System.Collections.Generic;

namespace Skies.Framework.Abstractions;

/// <summary>
/// The mechanics of a step-ordered lifecycle. An entity that walks an onboarding/approval sequence declares
/// its states as an enum <em>in step order</em> and stores the furthest one reached; this helper is the two
/// operations that order implies, so each entity stops re-deriving them:
///
/// <list type="bullet">
/// <item><description><see cref="Reached{TState}"/> — has the cursor passed (or landed on) a step? The gate
/// for "may this step's data be (re)written" — a step not yet reached is rejected, so steps can't be
/// skipped, while a completed one can be revisited.</description></item>
/// <item><description><see cref="Advance{TState}"/> — move forward exactly one step, and only from the step
/// being finished, so completing the current step progresses while re-editing an earlier one never
/// regresses the cursor.</description></item>
/// </list>
///
/// The comparison relies on declaration order (the enum's underlying values), which is the same contract the
/// pilot's Host/Traveler lifecycles depended on when this logic was duplicated byte-for-byte across them.
/// </summary>
/// <example>
/// <code>
/// // On the entity, the cursor is `LifecycleState`:
/// public bool StepReached(HostState step) => OrderedLifecycle.Reached(LifecycleState, step);
/// private void AdvancePast(HostState step, HostState next) =>
///     LifecycleState = OrderedLifecycle.Advance(LifecycleState, step, next);
/// </code>
/// </example>
public static class OrderedLifecycle
{
    /// <summary>True when <paramref name="current"/> is at or past <paramref name="step"/> in declaration
    /// order — so the step has been reached and its data may be written or re-edited. A step ahead of the
    /// cursor returns false (no skipping).</summary>
    public static bool Reached<TState>(TState current, TState step)
        where TState : struct, Enum =>
        Comparer<TState>.Default.Compare(current, step) >= 0;

    /// <summary>Advance the cursor to <paramref name="next"/> only when it is exactly at <paramref name="step"/>
    /// — finishing the current step moves forward. From any other position (an earlier step being re-edited, or
    /// a later one) it returns <paramref name="current"/> unchanged, so the cursor never regresses or jumps.</summary>
    public static TState Advance<TState>(TState current, TState step, TState next)
        where TState : struct, Enum =>
        EqualityComparer<TState>.Default.Equals(current, step) ? next : current;
}
