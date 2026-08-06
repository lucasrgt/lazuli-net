# @skiesjs/storage

The vendor-neutral file storage boundary for Skies Node.js applications, plus a secure local development adapter.
Provider packages can implement `FileStorage` without bringing their cloud SDKs into this package.

```ts
import { Readable } from "node:stream";
import { LocalFileStorage } from "@skiesjs/storage";

const storage = new LocalFileStorage(".data/files", "http://localhost:3000/files");
await storage.save("avatars/person one.png", Readable.from(bytes), "image/png", signal);
const url = await storage.getUrl("avatars/person one.png", 5 * 60_000, signal);
```

`getUploadUrl` and `getUrl` accept lifetimes in milliseconds. Local URLs are deliberately unsigned; an Express
adapter can call `openRead` to serve their contents. Keys are relative on every platform, accept `/` or `\` as a
separator, and reject rooted, drive, UNC, NUL, empty, and traversal forms before accessing the filesystem.
