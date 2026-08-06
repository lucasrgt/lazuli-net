import { describe, expect, it, vi } from "vitest";
import {
  e2e,
  integration,
  journey,
  JourneyPath,
  skiesTestOptions,
  startTestHost,
  TestKind,
  unit,
} from "./index.js";

declare module "@vitest/runner" {
  interface TaskMeta {
    owner?: string;
  }
}


unit("unit helper registers an executable test", () => {
  expect(true).toBe(true);
});

integration("integration helper registers an executable test", () => {
  expect(true).toBe(true);
});

e2e("e2e helper registers an executable test", () => {
  expect(true).toBe(true);
});

journey(
  { covers: "Wallets.Deposit", path: JourneyPath.Happy, criterion: "wallet.deposit" },
  "journey helper registers an executable proof",
  () => {
    expect(true).toBe(true);
  },
);

describe("Skies test metadata", () => {
  it("preserves custom options while closing the kind and journey tags", () => {
    const options = skiesTestOptions(
      TestKind.E2E,
      { timeout: 123, tags: ["slow", "skies:e2e"], meta: { owner: "wallets" } },
      { covers: "Wallets.Deposit", path: JourneyPath.Sad },
    );

    expect(options).toEqual({
      timeout: 123,
      tags: ["slow", "skies:e2e"],
      meta: {
        owner: "wallets",
        skies: {
          kind: "e2e",
          journey: { covers: "Wallets.Deposit", path: "sad" },
        },
      },
    });
  });

  it("rejects incomplete journey bindings before Vitest registration", () => {
    expect(() => journey({ covers: " ", path: JourneyPath.Happy }, "invalid", () => undefined)).toThrow(
      "non-empty operation ID",
    );
    expect(() =>
      journey(
        { covers: "Wallets.Deposit", path: "other" as JourneyPath },
        "invalid",
        () => undefined,
      ),
    ).toThrow("happy or sad");
    expect(() =>
      journey(
        { covers: "Wallets.Deposit", path: JourneyPath.Sad, criterion: "" },
        "invalid",
        () => undefined,
      ),
    ).toThrow("criterion");
  });
});

describe("startTestHost", () => {
  it("composes overrides before running the real startup seed", async () => {
    const order: string[] = [];
    const host = await startTestHost({
      overrides: { database: "isolated" },
      create(overrides) {
        order.push(`create:${overrides.database}`);
        return { database: overrides.database, seeded: false };
      },
      seed(application) {
        order.push(`seed:${application.database}`);
        application.seeded = true;
      },
      close(application) {
        order.push(`close:${application.seeded}`);
      },
    });

    expect(host.application).toEqual({ database: "isolated", seeded: true });
    expect(order).toEqual(["create:isolated", "seed:isolated"]);
    await host.close();
    await host.close();
    expect(order).toEqual(["create:isolated", "seed:isolated", "close:true"]);
  });

  it("closes a partially started application when seeding fails", async () => {
    const close = vi.fn();
    const failure = new Error("migration failed");

    await expect(
      startTestHost({
        overrides: undefined,
        create: () => ({ started: true }),
        seed: () => {
          throw failure;
        },
        close,
      }),
    ).rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
  });
});
