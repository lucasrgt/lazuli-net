import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { expect } from "vitest";
import { AccessTokens } from "@skiesjs/auth";
import { LocalFileStorage } from "@skiesjs/storage";
import { e2e } from "@skiesjs/testing";
import { createApplication } from "../../app.js";

const errorStatuses = ["400", "401", "403", "404", "409", "422", "429", "500", "503"];

// @skies-proof pilot.health-openapi
e2e("live OpenAPI publishes stable schemas and excludes health from the app projection", async () => {
  const root = await mkdtemp(join(tmpdir(), "wallet-openapi-e2e-"));
  const application = createApplication({
    accessTokens: new AccessTokens("openapi-test-secret", "wallet-pilot", "wallet-api"),
    listWallets: async (input) => ({
      items: [],
      totalCount: 0,
      pageNumber: input.pageNumber,
      pageSize: input.pageSize,
    }),
    storage: new LocalFileStorage(root, "/files"),
  });

  try {
    const full = await request(application.app).get("/openapi/v1.json");
    const appClient = await request(application.app).get("/openapi/app-v1.json");
    const listOperation = full.body.paths["/wallets"].get;
    const issueOperation = full.body.paths["/wallets/token"].post;

    expect(full.status).toBe(200);
    expect(listOperation.operationId).toBe("Wallets.List");
    expect(issueOperation.operationId).toBe("Wallets.IssuePilotToken");
    expect(full.body.paths["/health"].get.operationId).toBe("Wallets.Health");
    expect(listOperation.security).toEqual([{ bearerAuth: [] }]);
    expect(issueOperation.security).toEqual([]);
    expect(Object.keys(listOperation.responses).filter((status) => status !== "200")).toEqual(errorStatuses);
    expect(JSON.stringify(full.body.components.schemas["Wallets.ListOutput"])).toContain('"format":"uuid"');
    expect(full.body.components.schemas.ErrorBody.properties.code.enum).toContain("wallets.database_unavailable");
    expect(appClient.body.paths["/health"]).toBeUndefined();
    expect(appClient.body.paths["/wallets"].get.operationId).toBe("Wallets.List");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
