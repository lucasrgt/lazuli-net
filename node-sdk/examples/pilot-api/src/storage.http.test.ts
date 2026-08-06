import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { expect } from "vitest";
import { AccessTokens } from "@skiesjs/auth";
import { LocalFileStorage } from "@skiesjs/storage";
import { integration } from "@skiesjs/testing";
import { createApplication } from "./app.js";

integration("the explicitly mapped local adapter uploads and serves a byte range from a secure temporary root", async () => {
  const root = await mkdtemp(join(tmpdir(), "wallet-files-integration-"));
  const application = createApplication({
    accessTokens: new AccessTokens("storage-test-secret", "wallet-pilot", "wallet-api"),
    listWallets: async (input) => ({
      items: [],
      totalCount: 0,
      pageNumber: input.pageNumber,
      pageSize: input.pageSize,
    }),
    storage: new LocalFileStorage(root, "/files"),
  });

  try {
    const upload = await request(application.app)
      .put("/files/statements/report.txt")
      .set("Content-Type", "text/plain")
      .send("0123456789");
    const download = await request(application.app)
      .get("/files/statements/report.txt")
      .set("Range", "bytes=2-5");
    const mode = (await stat(root)).mode & 0o777;

    expect(upload.status).toBe(204);
    expect(download.status).toBe(206);
    expect(download.headers["content-range"]).toBe("bytes 2-5/10");
    expect(download.text).toBe("2345");
    expect(mode & 0o077).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
