import { expect } from "vitest";
import { AccessTokens, type Clock } from "@skiesjs/auth";
import { unit } from "@skiesjs/testing";
import { handle } from "./issue-token.slice.js";

const clock: Clock = { now: () => new Date("2030-01-02T03:04:05.000Z") };

unit("Wallets.IssuePilotToken issues a verifiable 15-minute access token", async () => {
  const accessTokens = new AccessTokens("unit-test-secret", "wallet-pilot", "wallet-api", clock);
  const result = await handle({
    userId: "11111111-1111-4111-8111-111111111111",
    orgId: "22222222-2222-4222-8222-222222222222",
    sessionId: "33333333-3333-4333-8333-333333333333",
    role: "reader",
    name: "Ada",
  }, accessTokens);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.expiresInSeconds).toBe(900);
  const verified = await accessTokens.verify(result.value.accessToken);
  expect(verified).toMatchObject({
    ok: true,
    value: { role: "reader", name: "Ada" },
  });
});
