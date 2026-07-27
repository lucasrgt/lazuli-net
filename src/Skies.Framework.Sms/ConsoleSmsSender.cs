namespace Skies.Framework.Sms;

/// <summary>
/// A dev/local <see cref="ISmsSender"/> that writes the message to the console instead of sending it,
/// so phone-verification flows run end-to-end with no provider wired. A real sender (Twilio, …) replaces
/// it in the composition root for staging and production.
/// </summary>
public sealed class ConsoleSmsSender : ISmsSender
{
    /// <inheritdoc />
    public Task SendAsync(string toPhone, string message, CancellationToken ct = default)
    {
        Console.WriteLine($"[sms] to={toPhone}: {message}");
        return Task.CompletedTask;
    }
}
