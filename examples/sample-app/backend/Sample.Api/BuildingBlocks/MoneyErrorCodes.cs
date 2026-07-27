namespace Sample.Api.BuildingBlocks;

/// <summary>Error codes for the <see cref="Money"/> value object — stable, namespaced i18n keys the frontend
/// localizes from. Codes live in a registry (not inline literals) so the set stays discoverable; the doctor
/// (<c>SKY0018</c>) enforces it.</summary>
public static class MoneyErrorCodes
{
    /// <summary>A monetary amount cannot be negative.</summary>
    public const string Negative = "money.negative";
}
