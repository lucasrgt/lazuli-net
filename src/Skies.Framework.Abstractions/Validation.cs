using System;
using System.Collections.Generic;

namespace Skies.Framework.Abstractions;

/// <summary>
/// Accumulates field-level validation errors so a slice reports all of them at once instead of
/// failing on the first. Append with <see cref="Check"/> (a condition) or <see cref="Add"/>
/// (e.g. a value object's failed construction), then return <see cref="ToError"/> while <see
/// cref="Failed"/>. The value object stays the single source of each rule — this only collects
/// the failures. Removable: a slice could accumulate into a plain list just as well.
/// </summary>
public sealed class Validation
{
    private readonly List<FieldError> _fields = [];

    /// <summary>Record an error for <paramref name="field"/> unless <paramref name="ok"/> holds, with a stable
    /// <paramref name="code"/> the client localizes from and a developer <paramref name="message"/>. Fluent.</summary>
    public Validation Check(bool ok, string field, string code, string message)
    {
        if (!ok)
            _fields.Add(new FieldError(field, code, message));
        return this;
    }

    /// <summary>Record an error for <paramref name="field"/> directly, with its <paramref name="code"/> and a
    /// developer <paramref name="message"/>. Fluent.</summary>
    public Validation Add(string field, string code, string message)
    {
        _fields.Add(new FieldError(field, code, message));
        return this;
    }

    /// <summary>
    /// Fold a value object's construction into the accumulation: if <paramref name="result"/>
    /// failed, record its error under <paramref name="field"/> — inheriting the value object's own
    /// <see cref="Error.Code"/> and message, since the value object is the single source of the rule
    /// (and its code). A value object that itself accumulated field errors (a multi-field
    /// <c>ToError()</c>) merges them verbatim — its <see cref="FieldError"/>s already carry their own
    /// paths and specific codes, and flattening them into the generic envelope code would lose the
    /// rule the client localizes from. Fluent.
    /// </summary>
    public Validation Collect<T>(string field, Result<T> result)
    {
        if (!result.IsFailure)
            return this;
        if (result.Error.Fields is { Count: > 0 } nested)
            _fields.AddRange(nested);
        else
            _fields.Add(new FieldError(field, result.Error.Code, result.Error.Message));
        return this;
    }

    /// <summary>Record an error for <paramref name="field"/> when <paramref name="value"/> is the empty
    /// <see cref="Guid"/> — the shape of every "id is required" check, written once. Fluent.</summary>
    public Validation Require(Guid value, string field, string code) =>
        Check(value != Guid.Empty, field, code, "is required");

    /// <summary>Record an error for <paramref name="field"/> when <paramref name="value"/> is null, empty,
    /// or only whitespace — the shape of every "text is required" check, written once. Fluent.</summary>
    public Validation NotBlank(string? value, string field, string code) =>
        Check(!string.IsNullOrWhiteSpace(value), field, code, "must not be blank");

    /// <summary>Record an error for <paramref name="field"/> when <paramref name="value"/> falls outside
    /// [<paramref name="min"/>, <paramref name="max"/>] (inclusive). The bounds are restated in the developer
    /// message so the failure reads without opening the slice. Fluent.</summary>
    public Validation InRange<T>(T value, T min, T max, string field, string code)
        where T : IComparable<T> =>
        Check(value.CompareTo(min) >= 0 && value.CompareTo(max) <= 0, field, code,
            $"must be between {min} and {max}");

    /// <summary>Whether any field error has been recorded.</summary>
    public bool Failed => _fields.Count > 0;

    /// <summary>Build one validation <see cref="Error"/> carrying every recorded field error.</summary>
    public Error ToError() => Error.Validation(_fields);
}
