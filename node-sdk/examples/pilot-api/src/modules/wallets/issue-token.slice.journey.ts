import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { expect } from "vitest";
import { AccessTokens, type Clock } from "@skiesjs/auth";
import { LocalFileStorage } from "@skiesjs/storage";
import { journey, JourneyPath } from "@skiesjs/testing";
import { createApplication } from "../../app.js";

const clock: Clock = { now: () => new Date("2030-01-02T03:04:05.000Z") };
const validBody = {
  userId: "11111111-1111-4111-8111-111111111111",
  orgId: "22222222-2222-4222-8222-222222222222",
  sessionId: "33333333-3333-4333-8333-333333333333",
  role: "reader",
  name: "Ada",
};

class CountingAccessTokens extends AccessTokens {
  public issueCalls = 0;

  public override async issue(
    userId: string,
    orgId: string,
    role: string | null | undefined,
    sessionId: string,
    name: string | null | undefined,
  ): Promise<string> {
    this.issueCalls += 1;
    return super.issue(userId, orgId, role, sessionId, name);
  }
}

journey(
  { covers: "Wallets.IssuePilotToken", path: JourneyPath.Happy, criterion: "pilot.token-issued" },
  "issues one verifiable access token for valid identity input",
  async () => {
    const fixture = await applicationFixture();
    try {
      const happyResponse = await request(fixture.app).post("/wallets/token").send(validBody);

      expect(happyResponse.status).toBe(201);
      expect(happyResponse.body.expiresInSeconds).toBe(900);
      expect(fixture.accessTokens.issueCalls).toBe(1);
    } finally {
      await fixture.close();
    }
  },
);

journey(
  { covers: "Wallets.IssuePilotToken", path: JourneyPath.Sad },
  "rejects malformed identity input without issuing a token",
  async () => {
    const fixture = await applicationFixture();
    try {
      const beforeState = fixture.accessTokens.issueCalls;
      const sadResponse = await request(fixture.app).post("/wallets/token").send({ ...validBody, userId: "invalid" });
      const afterState = fixture.accessTokens.issueCalls;

      expect(sadResponse.status).toBe(400);
      expect(afterState).toEqual(beforeState);
    } finally {
      await fixture.close();
    }
  },
);

async function applicationFixture(): Promise<{
  readonly app: ReturnType<typeof createApplication>["app"];
  readonly accessTokens: CountingAccessTokens;
  close(): Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "wallet-token-journey-"));
  const accessTokens = new CountingAccessTokens("journey-test-secret", "wallet-pilot", "wallet-api", clock);
  const application = createApplication({
    accessTokens,
    listWallets: async (input) => ({
      items: [], totalCount: 0, pageNumber: input.pageNumber, pageSize: input.pageSize,
    }),
    storage: new LocalFileStorage(root, "/files"),
  });
  return {
    app: application.app,
    accessTokens,
    close: () => rm(root, { recursive: true, force: true }),
  };
}
