using System.Text.RegularExpressions;

namespace Skies.Framework.Cli;

/// <summary>
/// The mechanical half of criteria selection (the Clockwork hybrid: a heuristic proposes, a human or the
/// LLM refines). It maps the words a slice wears — its name, its module, free keywords — onto the archetype
/// families they usually implicate: money words to money-integrity, auth words to the credential/token/
/// authorization family, and so on. Deliberately coarse and transparent; the output is a ranked shortlist
/// with the matched words, never a verdict.
/// </summary>
internal static class CriteriaHeuristic
{
    // keyword stems → catalog archetype ids. Stems (not exact words) so "payments", "submitted" and
    // "authorization" all land; matching is case-insensitive over tokenized input.
    private static readonly (string Archetype, string[] Stems)[] Map =
    [
        ("money-integrity", ["money", "price", "total", "fee", "split", "payout", "charge", "amount", "invoice", "balance"]),
        ("credential-authority", ["login", "signin", "credential", "password", "authenticate", "auth"]),
        ("token-rotation", ["refresh", "token", "session", "logout", "rotate"]),
        ("resource-uniqueness", ["register", "signup", "unique", "duplicate", "email", "slug", "handle"]),
        ("authorization", ["role", "permission", "admin", "owner", "own", "authorize", "auth", "tenant", "scope"]),
        ("access-control", ["protect", "private", "authenticated", "guard", "auth"]),
        ("lifecycle-gate", ["approve", "reject", "publish", "transition", "state", "status", "gate", "lifecycle", "cancel", "close"]),
        ("submission-gate", ["submit", "submission", "apply", "checkout", "checkin", "book", "reserve", "order"]),
        ("integration-integrity", ["webhook", "callback", "integration", "signature", "hmac", "provider"]),
        ("request-idempotency", ["create", "update", "delete", "mutate", "post", "withdraw", "deposit", "transfer", "pay", "send", "retry"]),
        ("second-order-effects", ["notify", "notification", "mail", "sms", "broadcast"]),
        ("pagination-integrity", ["list", "page", "search", "browse", "feed", "paginate"]),
    ];

    /// <summary>Split free-form input (PascalCase names, kebab words) into lowercase tokens.</summary>
    public static IReadOnlyList<string> Tokenize(string input) =>
        Regex.Matches(input, "[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\\d+")
            .Select(m => m.Value.ToLowerInvariant())
            .Where(t => t.Length > 1)
            .ToList();

    /// <summary>
    /// Rank archetypes by how many input tokens hit their stems; each entry carries the words that
    /// matched, so the shortlist explains itself.
    /// </summary>
    public static IReadOnlyList<(string Archetype, IReadOnlyList<string> MatchedWords)> Rank(IEnumerable<string> tokens)
    {
        var list = tokens.Distinct(StringComparer.Ordinal).ToList();
        return Map
            .Select(entry => (
                entry.Archetype,
                MatchedWords: (IReadOnlyList<string>)list
                    .Where(t => entry.Stems.Any(s => t.StartsWith(s, StringComparison.Ordinal) || s.StartsWith(t, StringComparison.Ordinal)))
                    .ToList()))
            .Where(r => r.MatchedWords.Count > 0)
            .OrderByDescending(r => r.MatchedWords.Count)
            .ThenBy(r => r.Archetype, StringComparer.Ordinal)
            .ToList();
    }
}
