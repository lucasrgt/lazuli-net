using System.Linq;

namespace Skies.Framework.Cli;

/// <summary>
/// Generates a SignalR hub in the convention's shape — thin wire over a module's slices, authenticated from
/// the connection's principal — and prints the one-time wiring for <c>Program.cs</c>. Real-time is opt-in,
/// the way Rails 8 dropped the default <c>channels/</c> folder: a fresh app has no hub until you generate one,
/// so the project carries no transport it doesn't use. The hub is the live half (typing, presence, instant
/// fan-out); the durable half stays the module's REST slices, and a hub method calls them rather than writing
/// to the database itself. The root namespace is read from the project's .csproj in the target directory.
/// </summary>
public static class HubGenerator
{
    /// <summary>Generate <paramref name="name"/>Hub in <paramref name="module"/> under the <paramref name="root"/> project.</summary>
    /// <param name="root">The application project directory (holding the .csproj).</param>
    /// <param name="module">The module the hub belongs to.</param>
    /// <param name="name">The hub name, without the <c>Hub</c> suffix (e.g. <c>Chat</c> → <c>ChatHub</c>).</param>
    /// <returns>0 on success; 1 if there is no project here or the hub already exists.</returns>
    public static int Generate(string root, string module, string name)
    {
        var csproj = Directory.GetFiles(root, "*.csproj").FirstOrDefault();
        if (csproj is null)
        {
            Console.Error.WriteLine("skies: no .csproj here — run this from the application project directory.");
            return 1;
        }

        var appNamespace = Path.GetFileNameWithoutExtension(csproj);
        var directory = Path.Combine(root, "Modules", module, "Realtime");
        var hubPath = Path.Combine(directory, name + "Hub.cs");

        if (File.Exists(hubPath))
        {
            Console.Error.WriteLine($"skies: {hubPath} already exists.");
            return 1;
        }

        Directory.CreateDirectory(directory);
        File.WriteAllText(hubPath, Hub(appNamespace, module, name));
        Console.WriteLine($"created {hubPath}");
        PrintWiring(name);
        return 0;
    }

    private static string Hub(string appNamespace, string module, string name) => $$"""
        using Skies.Framework.Auth;
        using Microsoft.AspNetCore.Authorization;
        using Microsoft.AspNetCore.SignalR;

        namespace {{appNamespace}}.Modules.{{module}}.Realtime;

        /// <summary>{{name}}Hub — the live layer for {{module}}. Wire, not logic: a hub method persists nothing
        /// itself; it calls the matching slice (the one source of the write + its rules) and fans the result out
        /// to the room. Ephemeral signals (typing, presence) ride the hub and never touch the database. The
        /// connection is JWT-authenticated, so the caller comes from <c>Context.User</c> via
        /// <see cref="ClaimsCurrentUser"/> — the request-scoped <c>ICurrentUser</c> reads the HTTP context, which
        /// a hub method does not have.</summary>
        [Authorize]
        public sealed class {{name}}Hub : Hub
        {
            private ICurrentUser Caller => new ClaimsCurrentUser(Context.User);

            /// <summary>Subscribe this connection to a room's live feed. Gate membership on your own
            /// participation rule (e.g. the caller is in the conversation) before adding the connection.</summary>
            public Task JoinRoom(string room) =>
                Groups.AddToGroupAsync(Context.ConnectionId, room);

            /// <summary>Unsubscribe this connection from a room.</summary>
            public Task LeaveRoom(string room) =>
                Groups.RemoveFromGroupAsync(Context.ConnectionId, room);

            /// <summary>Broadcast to the rest of a room. For a durable message, call the matching slice first to
            /// persist it (passing <c>Caller</c> as the ICurrentUser), then broadcast the saved result here.</summary>
            public Task Broadcast(string room, object payload) =>
                Clients.OthersInGroup(room).SendAsync("Receive", payload);
        }

        """;

    private static void PrintWiring(string name)
    {
        var route = name.ToLowerInvariant();
        Console.WriteLine(
            $$"""

            Real-time is opt-in. Wire {{name}}Hub in Program.cs:

              builder.Services.AddSignalR();
              // ... after app is built and authentication/authorization are mapped:
              app.MapHub<{{name}}Hub>("/hubs/{{route}}");

            A WebSocket can't send an Authorization header, so for hub paths the access token must
            ride the query string. With Skies.Framework.Auth's JWT, add (using Microsoft.AspNetCore.Authentication.JwtBearer):

              builder.Services.Configure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, o =>
                  o.Events = new JwtBearerEvents
                  {
                      OnMessageReceived = ctx =>
                      {
                          var token = ctx.Request.Query["access_token"];
                          if (!string.IsNullOrEmpty(token) && ctx.Request.Path.StartsWithSegments("/hubs"))
                              ctx.Token = token;
                          return Task.CompletedTask;
                      },
                  });

            Requires Skies.Framework.Auth (run `skies g auth` if you haven't). Scaling past one instance?
            Add a backplane: builder.Services.AddSignalR().AddStackExchangeRedis(connection).
            """);
    }
}
