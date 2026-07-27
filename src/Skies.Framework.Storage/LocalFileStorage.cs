namespace Skies.Framework.Storage;

/// <summary>
/// A dev/local <see cref="IFileStorage"/> that writes files under a base directory and returns a plain
/// (unsigned) URL — so upload flows run end-to-end with no cloud account. A real backend (S3 / R2 /
/// MinIO) replaces it in the composition root and is where genuine signed URLs come from.
/// </summary>
public sealed class LocalFileStorage : IFileStorage
{
    private readonly string _baseDirectory;
    private readonly string _baseUrl;

    /// <summary>
    /// Create a local store whose direct-upload and read URLs are served by the app's
    /// <c>MapSkiesLocalFiles</c> endpoint.
    /// </summary>
    /// <param name="baseDirectory">The directory files are written under.</param>
    /// <param name="baseUrl">The URL prefix the returned read URLs are built from.</param>
    public LocalFileStorage(string baseDirectory, string baseUrl)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(baseDirectory);
        ArgumentException.ThrowIfNullOrWhiteSpace(baseUrl);
        _baseDirectory = Path.GetFullPath(baseDirectory);
        _baseUrl = baseUrl.TrimEnd('/');
    }

    /// <inheritdoc />
    public async Task<string> SaveAsync(string key, Stream content, string contentType, CancellationToken ct = default)
    {
        var path = ResolvePath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var file = File.Create(path);
        await content.CopyToAsync(file, ct);
        return key;
    }

    /// <inheritdoc />
    public Task<Uri> GetUrlAsync(string key, TimeSpan ttl, CancellationToken ct = default) =>
        Task.FromResult(new Uri($"{_baseUrl}/{UrlPath(key)}"));

    /// <inheritdoc />
    public Task<UploadIntent> GetUploadUrlAsync(string key, string contentType, TimeSpan ttl, CancellationToken ct = default) =>
        Task.FromResult(new UploadIntent(key, $"{_baseUrl}/{UrlPath(key)}", "PUT", contentType, DateTimeOffset.UtcNow.Add(ttl)));

    /// <summary>
    /// Open a locally stored file for the development HTTP adapter, or return <see langword="null"/> when the key
    /// is absent. Applications normally consume <see cref="IFileStorage.GetUrlAsync"/> instead.
    /// </summary>
    public Task<Stream?> OpenReadAsync(string key, CancellationToken ct = default)
    {
        var path = ResolvePath(key);
        Stream? stream = File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous)
            : null;
        return Task.FromResult(stream);
    }

    /// <inheritdoc />
    public Task DeleteAsync(string key, CancellationToken ct = default)
    {
        var path = ResolvePath(key);
        if (File.Exists(path))
            File.Delete(path);
        return Task.CompletedTask;
    }

    private string ResolvePath(string key)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        var relative = key.Replace('/', Path.DirectorySeparatorChar);
        if (Path.IsPathRooted(relative))
            throw new ArgumentException("Storage keys must be relative paths.", nameof(key));

        var path = Path.GetFullPath(Path.Combine(_baseDirectory, relative));
        var checkedRelative = Path.GetRelativePath(_baseDirectory, path);
        if (checkedRelative == ".." || checkedRelative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
            || Path.IsPathRooted(checkedRelative))
            throw new ArgumentException("Storage keys cannot escape the configured directory.", nameof(key));
        return path;
    }

    private string UrlPath(string key)
    {
        _ = ResolvePath(key);
        return string.Join('/', key.Split(['/', '\\'], StringSplitOptions.RemoveEmptyEntries)
            .Select(Uri.EscapeDataString));
    }
}
