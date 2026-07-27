namespace Skies.Framework.Storage;

/// <summary>
/// Stores and serves files (avatars, documents, …). Skies ships the contract and a local dev store; a
/// real backend — S3, R2, MinIO, GCS — is a plugin that implements this and brings its SDK. The
/// composition root picks one, so changing backends is a one-line DI swap and the framework names no
/// vendor. <see cref="GetUrlAsync"/> returns a time-limited read URL, and <see cref="GetUploadUrlAsync"/>
/// a direct-upload intent — a real backend signs both; the dev store returns plain local URLs.
/// </summary>
public interface IFileStorage
{
    /// <summary>Store <paramref name="content"/> under <paramref name="key"/> and return the stored key.
    /// Throws on a transport failure. (Server-side put; for large client uploads prefer
    /// <see cref="GetUploadUrlAsync"/>.)</summary>
    Task<string> SaveAsync(string key, Stream content, string contentType, CancellationToken ct = default);

    /// <summary>Issue a time-limited direct-upload intent for <paramref name="key"/>: the client PUTs the
    /// bytes straight to <see cref="UploadIntent.Url"/> (a real backend presigns it; the dev store points
    /// at a local URL), then the app confirms. Keeps large uploads off the API.</summary>
    Task<UploadIntent> GetUploadUrlAsync(string key, string contentType, TimeSpan ttl, CancellationToken ct = default);

    /// <summary>A URL to read the file at <paramref name="key"/>, valid for <paramref name="ttl"/> (signed
    /// by a real backend, plain from the dev store).</summary>
    Task<Uri> GetUrlAsync(string key, TimeSpan ttl, CancellationToken ct = default);

    /// <summary>Remove the file at <paramref name="key"/>. A no-op if it is already gone.</summary>
    Task DeleteAsync(string key, CancellationToken ct = default);
}
