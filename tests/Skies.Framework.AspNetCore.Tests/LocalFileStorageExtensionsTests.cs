using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Skies.Framework.AspNetCore;
using Skies.Framework.Storage;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Skies.Framework.AspNetCore.Tests;

public class LocalFileStorageExtensionsTests
{
    [Fact]
    public async Task A_local_upload_intent_accepts_the_bytes_and_serves_them_back()
    {
        var directory = Path.Combine(Path.GetTempPath(), "skies-local-files", Guid.NewGuid().ToString("N"));
        try
        {
            var storage = new LocalFileStorage(directory, "http://localhost/files");
            await using var app = await StartApp(storage);
            var client = app.GetTestClient();
            var intent = await storage.GetUploadUrlAsync("photos/hello world.txt", "text/plain", TimeSpan.FromMinutes(5));

            using var upload = new ByteArrayContent(Encoding.UTF8.GetBytes("stored through HTTP"));
            upload.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
            var put = await client.PutAsync(intent.Url, upload);
            var read = await client.GetAsync(intent.Url);

            Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);
            Assert.Equal("stored through HTTP", await read.Content.ReadAsStringAsync());
            Assert.Equal("text/plain", read.Content.Headers.ContentType?.MediaType);
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task Traversal_cannot_escape_the_local_storage_directory()
    {
        var directory = Path.Combine(Path.GetTempPath(), "skies-local-files", Guid.NewGuid().ToString("N"));
        try
        {
            var storage = new LocalFileStorage(directory, "http://localhost/files");

            await Assert.ThrowsAsync<ArgumentException>(() =>
                storage.SaveAsync("../escaped.txt", new MemoryStream(Encoding.UTF8.GetBytes("no")), "text/plain"));

            Assert.False(File.Exists(Path.Combine(Path.GetDirectoryName(directory)!, "escaped.txt")));
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    private static async Task<WebApplication> StartApp(LocalFileStorage storage)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddSingleton<IFileStorage>(storage);
        var app = builder.Build();
        app.MapSkiesLocalFiles();
        await app.StartAsync();
        return app;
    }
}
