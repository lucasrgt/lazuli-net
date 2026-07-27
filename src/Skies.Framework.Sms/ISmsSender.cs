namespace Skies.Framework.Sms;

/// <summary>
/// The port every SMS delivery implements. Skies ships the contract and a dev sender; the vendor
/// (Twilio, Vonage, …) is an external plugin that implements this and brings its own SDK. The
/// composition root picks which one, so changing providers is a one-line DI swap — and the framework
/// never takes a dependency on any vendor.
/// </summary>
public interface ISmsSender
{
    /// <summary>Deliver <paramref name="message"/> to <paramref name="toPhone"/>. Throws on a transport failure.</summary>
    Task SendAsync(string toPhone, string message, CancellationToken ct = default);
}
