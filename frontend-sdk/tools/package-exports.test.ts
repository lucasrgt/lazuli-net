// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

describe("frontend SDK package exports", () => {
  it("loads the Playwright backend observer from CommonJS global setup", () => {
    const require = createRequire(import.meta.url);
    const backend = require("skies-frontend-sdk/playwright-backend");

    expect(backend).toMatchObject({
      createBackendGlobalSetup: expect.any(Function),
      expectBackendSlices: expect.any(Function),
      waitForBackendSlices: expect.any(Function),
      observeBackend: expect.any(Function),
      probeBackend: expect.any(Function),
    });
  });

  it("loads the fail-closed Playwright fixture", async () => {
    const playwright = await import("skies-frontend-sdk/playwright");

    expect(playwright).toMatchObject({
      expect: expect.any(Function),
      test: expect.any(Function),
      watchPageQuality: expect.any(Function),
    });
  });
});
