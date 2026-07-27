namespace Skies.Framework.Mail;

/// <summary>
/// A dev/local <see cref="IEmailSender"/> that writes the message to the console instead of delivering
/// it. It is the zero-config default, so a fresh app's auth flows run end-to-end with no provider wired;
/// a real delivery — SMTP, or an external plugin like Resend — replaces it in the composition root for
/// staging and production.
/// </summary>
public sealed class ConsoleEmailSender : IEmailSender
{
    /// <inheritdoc />
    public Task SendAsync(EmailMessage message, CancellationToken ct = default)
    {
        Console.WriteLine($"[email] to={message.To} subject=\"{message.Subject}\"");
        Console.WriteLine(message.Body);
        return Task.CompletedTask;
    }
}
