using Skies.Framework.Cli;

namespace Skies.Framework.Cli.Tests;

public class CriteriaHeuristicTests
{
    [Fact]
    public void Tokenizes_pascal_case_and_kebab_words()
    {
        Assert.Equal(new[] { "create", "checkout", "preference" }, CriteriaHeuristic.Tokenize("CreateCheckoutPreference"));
        Assert.Equal(new[] { "submit", "supplier", "response" }, CriteriaHeuristic.Tokenize("submit-supplier-response"));
    }

    [Fact]
    public void A_mutation_slice_implicates_request_idempotency()
    {
        var ranked = CriteriaHeuristic.Rank(CriteriaHeuristic.Tokenize("Withdraw"));

        Assert.Contains(ranked, r => r.Archetype == "request-idempotency");
    }

    [Fact]
    public void An_auth_slice_implicates_the_credential_family()
    {
        var ranked = CriteriaHeuristic.Rank(CriteriaHeuristic.Tokenize("Login"));

        Assert.Contains(ranked, r => r.Archetype == "credential-authority");
    }

    [Fact]
    public void The_shortlist_explains_itself_with_the_matched_words()
    {
        var ranked = CriteriaHeuristic.Rank(CriteriaHeuristic.Tokenize("CreateCheckoutPreference"));

        var submission = Assert.Single(ranked, r => r.Archetype == "submission-gate");
        Assert.Contains("checkout", submission.MatchedWords);
    }

    [Fact]
    public void Unmatched_words_rank_nothing()
    {
        Assert.Empty(CriteriaHeuristic.Rank(CriteriaHeuristic.Tokenize("Zzz")));
    }
}
