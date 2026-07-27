namespace Skies.Framework.Testing;

/// <summary>The path a journey proves: the success flow, or a failure flow.</summary>
public enum JourneyPath
{
    /// <summary>The success flow — the operation completes and its effect is observable end-to-end.</summary>
    Happy,

    /// <summary>A failure flow — the operation is rejected with the right status and leaves no partial state.</summary>
    Sad,
}

/// <summary>
/// Declares that one executable <c>[E2E]</c> test method is the journey proving one write slice on a given
/// <see cref="Path"/>. The relation is enforced both ways: <c>SKY0008</c> requires every write slice to
/// have both a <see cref="JourneyPath.Happy"/> and a <see cref="JourneyPath.Sad"/> journey, and
/// <c>SKY0010</c> requires every journey to cover a write slice. So a journey is exactly the proof of a
/// state-changing operation — not a label for any flow: a voluntary end-to-end test that proves a read
/// is a plain <c>[E2E]</c> with no <c>[Journey]</c> (by convention a <c>*Flow.Tests.cs</c>, vs a
/// <c>*Journey.Tests.cs</c>).
///
/// A sad journey must assert both the failure status <em>and</em> that no state changed — the
/// no-partial-state property only an end-to-end test can prove. The highest-impact sad path is the
/// failure that can occur after a mutation has begun (a conflict, an unavailable dependency, a
/// post-write rule); a fail-fast guard (validation, not-found) is lower impact because there is no
/// partial state to leave.
/// </summary>
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public sealed class JourneyAttribute : Attribute
{
    /// <summary>Declare the write slice this journey proves and which path it covers.</summary>
    /// <param name="covers">The write slice this journey proves.</param>
    /// <param name="path">Whether this journey proves the happy flow or a sad flow.</param>
    public JourneyAttribute(Type covers, JourneyPath path)
    {
        Covers = covers;
        Path = path;
    }

    /// <summary>The write slice this journey proves.</summary>
    public Type Covers { get; }

    /// <summary>Whether this journey proves the happy flow or a sad flow.</summary>
    public JourneyPath Path { get; }
}
