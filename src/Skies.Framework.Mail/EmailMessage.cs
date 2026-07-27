namespace Skies.Framework.Mail;

/// <summary>
/// An email to deliver: the recipient, the subject, and the body. The body is plain text — auth emails
/// carry a verification or reset link, which needs no markup — so a richer (HTML / templated) message is
/// a later addition, not a day-one need.
/// </summary>
/// <param name="To">The recipient address.</param>
/// <param name="Subject">The subject line.</param>
/// <param name="Body">The plain-text body.</param>
public sealed record EmailMessage(string To, string Subject, string Body);
