using Skies.Framework.Abstractions;

namespace Skies.Framework.Abstractions.Tests;

public class ValidationTests
{
    [Fact]
    public void Require_records_the_empty_guid_and_accepts_a_real_one()
    {
        var validation = new Validation()
            .Require(Guid.Empty, "walletId", "walletId.required")
            .Require(Guid.NewGuid(), "ownerId", "ownerId.required");

        Assert.True(validation.Failed);
        var error = validation.ToError();
        var field = Assert.Single(error.Fields!);
        Assert.Equal("walletId", field.Field);
        Assert.Equal("walletId.required", field.Code);
    }

    [Fact]
    public void NotBlank_records_null_empty_and_whitespace_but_accepts_text()
    {
        var validation = new Validation()
            .NotBlank(null, "name", "name.required")
            .NotBlank("", "email", "email.required")
            .NotBlank("   ", "phone", "phone.required")
            .NotBlank("ada", "handle", "handle.required");

        Assert.Equal(3, validation.ToError().Fields!.Count);
    }

    [Fact]
    public void InRange_is_inclusive_on_both_bounds()
    {
        var validation = new Validation()
            .InRange(1, 1, 10, "low", "low.out_of_range")
            .InRange(10, 1, 10, "high", "high.out_of_range")
            .InRange(11, 1, 10, "over", "over.out_of_range");

        var error = validation.ToError();
        var field = Assert.Single(error.Fields!);
        Assert.Equal("over", field.Field);
        Assert.Contains("between 1 and 10", field.Message);
    }

    [Fact]
    public void Sugar_accumulates_alongside_check_and_collect()
    {
        // The overloads are shorthand for Check, not a parallel mechanism: everything lands in the
        // same accumulation and reports together.
        var amount = Result<int>.Fail(Error.Validation("amount.negative", "cannot be negative"));
        var validation = new Validation()
            .Require(Guid.Empty, "walletId", "walletId.required")
            .Collect("amount", amount);

        Assert.True(validation.Failed);
        Assert.Equal(2, validation.ToError().Fields!.Count);
    }

    [Fact]
    public void Collect_merges_a_nested_multi_field_error_keeping_each_specific_code()
    {
        // A value object that itself accumulated field errors (ToError → the generic envelope code)
        // must surface THOSE codes, not one flattened "validation.failed" — the client localizes
        // from the field code, and the specific rule is the whole point of the registry constant.
        var nested = new Validation()
            .Check(false, "installments", "installments.mismatch", "must match the expected total")
            .Check(false, "installments[0].valueInCents", "installments.invalid", "value must be positive")
            .ToError();
        var validation = new Validation().Collect("installments", Result<int>.Fail(nested));

        var fields = validation.ToError().Fields!;
        Assert.Equal(2, fields.Count);
        Assert.Contains(fields, f => f.Code == "installments.mismatch");
        Assert.Contains(fields, f => f.Code == "installments.invalid" && f.Field == "installments[0].valueInCents");
        Assert.DoesNotContain(fields, f => f.Code == "validation.failed");
    }
}
