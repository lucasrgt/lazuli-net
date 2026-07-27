namespace Skies.Framework.Mail;

/// <summary>
/// The port every email delivery implements. Skies ships the contract and a dev sender; it ships no
/// vendor. SMTP delivery — the open protocol — wraps a mature library (MailKit) in a companion package;
/// a SaaS such as Resend or SendGrid is an <em>external plugin</em> that implements this interface and
/// brings its own SDK. The composition root picks which one, so changing providers is a one-line DI
/// swap, not a code rewrite — and the framework never takes a dependency on any one vendor.
/// </summary>
/// <remarks>
/// A transport failure throws; the calling flow decides whether a failed send is fatal. Most auth sends
/// are best-effort: the token is already persisted, so a later resend recovers without losing state.
/// </remarks>
public interface IEmailSender
{
    /// <summary>Deliver <paramref name="message"/>. Throws on a transport failure.</summary>
    Task SendAsync(EmailMessage message, CancellationToken ct = default);
}
