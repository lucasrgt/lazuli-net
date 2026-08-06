# @skiesjs/storage-express

The explicit Express 5 adapter that makes `LocalFileStorage` upload intents and read URLs work in development and
CI. It registers raw Express routes rather than using slice or OpenAPI registration, so the routes are anonymous and
excluded from generated API descriptions by convention.

```ts
import express from "express";
import { LocalFileStorage } from "@skiesjs/storage";
import { mapLocalFiles } from "@skiesjs/storage-express";

const app = express();
const storage = new LocalFileStorage(".data/files", "http://localhost:3000/files");
mapLocalFiles(app, storage); // Registers PUT and range-capable GET /files/{*key}.
```

Pass `{ routePrefix: "/local-files" }` when the storage base URL uses another path. Register the routes before any
application-wide authentication middleware. Removing the `mapLocalFiles` call plainly removes the HTTP adapter; the
storage contract has no DI, discovery, or hidden route registration.
