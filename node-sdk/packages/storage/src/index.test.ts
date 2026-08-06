import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFileStorage } from "./index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createStorage(): Promise<{ readonly root: string; readonly storage: LocalFileStorage }> {
  const root = await mkdtemp(join(tmpdir(), "skies-storage-"));
  roots.push(root);
  return { root, storage: new LocalFileStorage(root, "http://localhost/files/") };
}

async function streamText(stream: Readable | null): Promise<string | null> {
  if (stream === null) return null;
  let text = "";
  for await (const chunk of stream) text += String(chunk);
  return text;
}

describe("LocalFileStorage", () => {
  it("streams a save, opens it for reading, and deletes idempotently", async () => {
    const { root, storage } = await createStorage();

    const key = await storage.save(
      "documents\\reports/summary.txt",
      Readable.from(["stored ", "without buffering"]),
      "text/plain",
    );

    expect(key).toBe("documents\\reports/summary.txt");
    expect(await readFile(join(root, "documents", "reports", "summary.txt"), "utf8")).toBe(
      "stored without buffering",
    );
    expect(await streamText(await storage.openRead(key))).toBe("stored without buffering");

    await storage.delete(key);
    await storage.delete(key);
    expect(await storage.openRead(key)).toBeNull();
  });

  it("rejects empty, rooted, drive, UNC, NUL, and traversing keys using either separator", async () => {
    const { storage } = await createStorage();
    const invalidKeys = [
      "",
      "   ",
      "bad\0key",
      "/absolute.txt",
      "\\absolute.txt",
      "C:\\absolute.txt",
      "C:/absolute.txt",
      "C:drive-relative.txt",
      "\\\\server\\share\\file.txt",
      "//server/share/file.txt",
      "../escaped.txt",
      "..\\escaped.txt",
      "safe/../escaped.txt",
      "safe\\..\\escaped.txt",
    ];

    for (const key of invalidKeys) {
      await expect(storage.save(key, Readable.from("no"), "text/plain")).rejects.toThrow(TypeError);
      await expect(storage.getUrl(key, 60_000)).rejects.toThrow(TypeError);
      await expect(storage.getUploadUrl(key, "text/plain", 60_000)).rejects.toThrow(TypeError);
      await expect(storage.openRead(key)).rejects.toThrow(TypeError);
      await expect(storage.delete(key)).rejects.toThrow(TypeError);
    }
  });

  it("reports byte length and opens inclusive ranges for HTTP range delivery", async () => {
    const { storage } = await createStorage();
    await storage.save("videos/clip.bin", Readable.from(Buffer.from("0123456789")), "application/octet-stream");

    expect(await storage.getSize("videos/clip.bin")).toBe(10);
    expect(await streamText(await storage.openReadRange("videos/clip.bin", 2, 5))).toBe("2345");
    expect(await storage.getSize("videos/missing.bin")).toBeNull();
    expect(await storage.openReadRange("videos/missing.bin", 0, 1)).toBeNull();
    await expect(storage.openReadRange("videos/clip.bin", 5, 2)).rejects.toThrow(RangeError);
  });

  it("URL-encodes every segment while preserving spaces and Unicode in storage keys", async () => {
    const { storage } = await createStorage();
    const key = "résumé 你好/hello world #%.txt";

    await storage.save(key, Readable.from("international"), "text/plain");

    expect(await storage.getUrl(key, 30_000)).toBe(
      "http://localhost/files/r%C3%A9sum%C3%A9%20%E4%BD%A0%E5%A5%BD/hello%20world%20%23%25.txt",
    );
    expect(await streamText(await storage.openRead(key))).toBe("international");
  });

  it("issues a local PUT intent with the requested content type and lifetime", async () => {
    const { storage } = await createStorage();
    const before = Date.now();

    const intent = await storage.getUploadUrl("photos/profile image.png", "image/png", 120_000);

    expect(intent).toMatchObject({
      key: "photos/profile image.png",
      url: "http://localhost/files/photos/profile%20image.png",
      method: "PUT",
      contentType: "image/png",
    });
    expect(intent.expiresAt).toBeInstanceOf(Date);
    expect(intent.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 120_000);
    expect(intent.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 120_000);
  });

  it("honors an already-aborted signal before touching storage", async () => {
    const { storage } = await createStorage();
    const signal = AbortSignal.abort();

    await expect(storage.save("stopped.txt", Readable.from("no"), "text/plain", signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(storage.getUrl("stopped.txt", 1_000, signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(storage.openRead("stopped.txt", signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(storage.delete("stopped.txt", signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
