import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFileStorage } from "@skiesjs/storage";
import { mapLocalFiles } from "./index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createStorage(baseUrl = "http://localhost/files"): Promise<LocalFileStorage> {
  const root = await mkdtemp(join(tmpdir(), "skies-storage-express-"));
  roots.push(root);
  return new LocalFileStorage(root, baseUrl);
}

function intentPath(url: string): string {
  return new URL(url).pathname;
}

describe("mapLocalFiles", () => {
  it("accepts upload-intent bytes through an Express 5 wildcard and reads them back", async () => {
    const storage = await createStorage();
    const app = express();
    const router = express.Router();
    expect(mapLocalFiles(router, storage)).toBe(router);
    app.use(router);
    const intent = await storage.getUploadUrl("documents/reports/hello world.txt", "text/plain", 60_000);

    const upload = await request(app)
      .put(intentPath(intent.url))
      .set("Content-Type", intent.contentType)
      .send(Buffer.from("stored through HTTP"));
    const download = await request(app).get(intentPath(intent.url));

    expect(upload.status).toBe(204);
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toBe("text/plain");
    expect(download.text).toBe("stored through HTTP");
  });

  it("preserves spaces, Unicode, and multiple Express 5 wildcard segments", async () => {
    const storage = await createStorage();
    const app = express();
    mapLocalFiles(app, storage);
    const intent = await storage.getUploadUrl("résumé 你好/hello world.txt", "text/plain", 60_000);

    await request(app).put(intentPath(intent.url)).set("Content-Type", intent.contentType).send("international");
    const download = await request(app).get(intentPath(intent.url));

    expect(download.status).toBe(200);
    expect(download.text).toBe("international");
  });

  it("serves standard, open-ended, and suffix byte ranges", async () => {
    const storage = await createStorage();
    const app = express();
    mapLocalFiles(app, storage);
    await request(app).put("/files/video.bin").send(Buffer.from("0123456789"));

    const bounded = await request(app).get("/files/video.bin").set("Range", "bytes=2-5");
    expect(bounded.status).toBe(206);
    expect(bounded.headers["accept-ranges"]).toBe("bytes");
    expect(bounded.headers["content-range"]).toBe("bytes 2-5/10");
    expect(bounded.headers["content-length"]).toBe("4");
    expect(bounded.body).toEqual(Buffer.from("2345"));

    expect((await request(app).get("/files/video.bin").set("Range", "bytes=7-")).body)
      .toEqual(Buffer.from("789"));
    expect((await request(app).get("/files/video.bin").set("Range", "bytes=-3")).body)
      .toEqual(Buffer.from("789"));
  });

  it("returns 416 and the complete length for malformed or unsatisfiable ranges", async () => {
    const storage = await createStorage();
    const app = express();
    mapLocalFiles(app, storage);
    await request(app).put("/files/video.bin").send(Buffer.from("0123456789"));

    for (const range of ["bytes=10-", "bytes=6-2", "bytes=-0", "bytes=0-1,4-5", "items=0-1"]) {
      const response = await request(app).get("/files/video.bin").set("Range", range);
      expect(response.status).toBe(416);
      expect(response.headers["content-range"]).toBe("bytes */10");
    }
  });

  it("uses the small MIME table and falls back for unknown extensions", async () => {
    const storage = await createStorage();
    const app = express();
    mapLocalFiles(app, storage);

    await request(app).put("/files/archive.unknown-extension").send(Buffer.from([0, 1, 2, 3]));
    const download = await request(app).get("/files/archive.unknown-extension");

    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toBe("application/octet-stream");
    expect(download.body).toEqual(Buffer.from([0, 1, 2, 3]));
  });

  it("validates the prefix synchronously and normalizes its trailing slash", async () => {
    const storage = await createStorage("http://localhost/local-files");
    const invalidPrefixes = ["", "files", "/", "/files/{key}", "/files/*key", "/safe/../files", "/files//nested"];

    for (const routePrefix of invalidPrefixes) {
      expect(() => mapLocalFiles(express(), storage, { routePrefix })).toThrow(TypeError);
    }

    const app = express();
    mapLocalFiles(app, storage, { routePrefix: "/local-files/" });
    expect((await request(app).put("/local-files/file.txt").send("value")).status).toBe(204);
    expect((await request(app).get("/local-files/file.txt")).text).toBe("value");
  });

  it("returns 400 for missing, blank, and traversal keys without leaving the storage root", async () => {
    const storage = await createStorage();
    const app = express();
    mapLocalFiles(app, storage);

    for (const path of ["/files", "/files/", "/files/%20%20", "/files/..%2Fescaped.txt", "/files/safe%5C..%5Cescaped.txt"]) {
      expect((await request(app).put(path).send("no")).status).toBe(400);
      expect((await request(app).get(path)).status).toBe(400);
    }
    expect(await storage.openRead("escaped.txt")).toBeNull();
  });

  it("returns 404 when a valid key is absent", async () => {
    const storage = await createStorage();
    const app = express();
    mapLocalFiles(app, storage);

    expect((await request(app).get("/files/not-here.txt")).status).toBe(404);
  });

  it("passes unexpected storage failures to Express error middleware", async () => {
    const storage = await createStorage();
    const failure = new Error("disk unavailable");
    storage.save = async () => { throw failure; };
    storage.getSize = async () => { throw failure; };
    storage.openRead = async () => { throw failure; };
    const app = express();
    mapLocalFiles(app, storage);
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(503).json({ handled: error === failure });
    });

    const upload = await request(app).put("/files/report.txt").send("value");
    const download = await request(app).get("/files/report.txt");

    expect(upload.status).toBe(503);
    expect(upload.body).toEqual({ handled: true });
    expect(download.status).toBe(503);
    expect(download.body).toEqual({ handled: true });
  });

  it("does not abort storage signals when normal responses close", async () => {
    const storage = await createStorage();
    let saveSignal: AbortSignal | undefined;
    let readSignal: AbortSignal | undefined;
    const originalSave = storage.save.bind(storage);
    const originalOpenRead = storage.openRead.bind(storage);
    storage.save = async (key, content, contentType, signal) => {
      saveSignal = signal;
      return originalSave(key, content, contentType, signal);
    };
    storage.openRead = async (key, signal) => {
      readSignal = signal;
      return originalOpenRead(key, signal);
    };
    const app = express();
    mapLocalFiles(app, storage);

    await request(app).put("/files/finished.txt").send("finished");
    await request(app).get("/files/finished.txt");

    expect(saveSignal?.aborted).toBe(false);
    expect(readSignal?.aborted).toBe(false);
  });

  it("propagates an aborted upload request to storage", async () => {
    const storage = await createStorage();
    let observedAbort!: () => void;
    const aborted = new Promise<void>((resolve) => { observedAbort = resolve; });
    storage.save = (_key, _content, _contentType, signal) =>
      new Promise<string>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          observedAbort();
          reject(signal.reason);
        }, { once: true });
      });
    const app = express();
    mapLocalFiles(app, storage);

    const upload = request(app).put("/files/interrupted.txt").send("partial");
    const pending = upload.then(() => undefined, () => undefined);
    setTimeout(() => upload.abort(), 10);

    await aborted;
    await pending;
  });
});
