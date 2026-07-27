namespace Skies.Framework.Storage;

/// <summary>
/// A time-limited instruction for a client to upload a file directly to storage: PUT the bytes to
/// <see cref="Url"/> with the given <see cref="ContentType"/>, then call the app's confirm step with
/// <see cref="Key"/>. A real backend presigns <see cref="Url"/>; the dev store points at a local URL.
/// </summary>
/// <param name="Key">The storage key the file will live under.</param>
/// <param name="Url">The URL to upload to (presigned by a real backend).</param>
/// <param name="Method">The HTTP method to upload with (typically <c>PUT</c>).</param>
/// <param name="ContentType">The content type the client must send.</param>
/// <param name="ExpiresAt">When the upload URL stops being valid.</param>
public sealed record UploadIntent(string Key, string Url, string Method, string ContentType, DateTimeOffset ExpiresAt);
