import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { expect } from "vitest";
import { AccessTokens, AuthErrorCodes, type Clock, type CurrentUser } from "@skiesjs/auth";
import { LocalFileStorage } from "@skiesjs/storage";
import { e2e, unit } from "@skiesjs/testing";
import { createApplication } from "../../app.js";
import { createWalletId } from "./wallet-id.js";
import { handle, type ListWallets } from "./list-wallets.slice.js";

const clock: Clock = { now: () => new Date("2030-01-02T03:04:05.000Z") };
const rowId = createWalletId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
if (!rowId.ok) throw new Error("test UUID must be valid");
const rowWalletId = rowId.value;
const user: CurrentUser = {
  isAuthenticated: true,
  userId: "11111111-1111-4111-8111-111111111111",
  orgId: "22222222-2222-4222-8222-222222222222",
  sessionId: "33333333-3333-4333-8333-333333333333",
  role: "reader",
  name: "Ada",
};

// @skies-proof pilot.wallet-list
unit("Wallets.List delegates requested bounds through the explicit page callback", async () => {
  let observed: { readonly pageNumber: number; readonly pageSize: number } | undefined;
  const listWallets: ListWallets = async (input) => {
    observed = input;
    return { items: [], totalCount: 25, pageNumber: input.pageNumber, pageSize: input.pageSize };
  };

  const result = await handle({ pageNumber: 2, pageSize: 10 }, user, listWallets);

  expect(observed).toMatchObject({ pageNumber: 2, pageSize: 10, orgId: user.orgId });
  expect(result).toMatchObject({ ok: true, value: { totalCount: 25, pageNumber: 2, pageSize: 10 } });
});

e2e("Wallets.List returns the stable unauthorized envelope without a bearer token", async () => {
  const fixture = await applicationFixture();
  try {
    const response = await request(fixture.app).get("/wallets");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Unauthorized",
      code: AuthErrorCodes.invalidAccessToken,
      message: "invalid access token",
      fields: null,
    });
  } finally {
    await fixture.close();
  }
});

e2e(
  "a token authorizes the paged wallet query",
  async () => {
    const fixture = await applicationFixture();
    try {
      const issued = await request(fixture.app).post("/wallets/token").send({
        userId: "11111111-1111-4111-8111-111111111111",
        orgId: "22222222-2222-4222-8222-222222222222",
        sessionId: "33333333-3333-4333-8333-333333333333",
        role: "reader",
        name: "Ada",
      });
      const listed = await request(fixture.app)
        .get("/wallets?pageNumber=2&pageSize=1")
        .set("Authorization", `Bearer ${String(issued.body.accessToken)}`);

      expect(issued.status).toBe(201);
      expect(listed.status).toBe(200);
      expect(listed.body).toEqual({
        items: [{
          walletId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          displayName: "Operations",
          createdAt: "2030-01-01T00:00:00.000Z",
        }],
        totalCount: 2,
        pageNumber: 2,
        pageSize: 1,
      });
    } finally {
      await fixture.close();
    }
  },
);

async function applicationFixture(): Promise<{
  readonly app: ReturnType<typeof createApplication>["app"];
  close(): Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "wallet-list-e2e-"));
  const accessTokens = new AccessTokens("e2e-test-secret", "wallet-pilot", "wallet-api", clock);
  const listWallets: ListWallets = async (input) => ({
    items: [{
      walletId: rowWalletId,
      displayName: "Operations",
      createdAt: "2030-01-01T00:00:00.000Z",
    }],
    totalCount: 2,
    pageNumber: input.pageNumber,
    pageSize: input.pageSize,
  });
  const application = createApplication({
    accessTokens,
    listWallets,
    storage: new LocalFileStorage(root, "/files"),
  });
  return { app: application.app, close: () => rm(root, { recursive: true, force: true }) };
}
