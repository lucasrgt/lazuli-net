using Skies.Framework.Abstractions;

namespace Skies.Framework.Abstractions.Tests;

public class ResultTests
{
    [Fact]
    public void The_error_catalog_is_closed_over_the_nine_transport_kinds()
    {
        Assert.Equal(
            [
                ErrorKind.Validation,
                ErrorKind.Unauthorized,
                ErrorKind.Forbidden,
                ErrorKind.NotFound,
                ErrorKind.Conflict,
                ErrorKind.BusinessRule,
                ErrorKind.RateLimit,
                ErrorKind.Internal,
                ErrorKind.Unavailable,
            ],
            Enum.GetValues<ErrorKind>());
    }

    [Fact]
    public void A_success_exposes_only_its_value()
    {
        Result<int> result = 42;

        Assert.True(result.IsSuccess);
        Assert.False(result.IsFailure);
        Assert.Equal(42, result.Value);
        Assert.Throws<InvalidOperationException>(() => result.Error);
    }

    [Fact]
    public void A_failure_exposes_only_its_stable_error()
    {
        var expected = Error.NotFound("wallets.not_found", "wallet not found");
        Result<int> result = expected;

        Assert.True(result.IsFailure);
        Assert.False(result.IsSuccess);
        Assert.Equal(expected, result.Error);
        Assert.Throws<InvalidOperationException>(() => result.Value);
    }

    [Fact]
    public void Validation_fields_keep_their_machine_readable_contract()
    {
        var fields = new[]
        {
            new FieldError("email", "email.invalid", "email is invalid"),
            new FieldError("name", "name.required", "name is required"),
        };

        var error = Error.Validation(fields);

        Assert.Equal(ErrorKind.Validation, error.Kind);
        Assert.Equal("validation.failed", error.Code);
        Assert.Equal(fields, error.Fields);
    }
}
