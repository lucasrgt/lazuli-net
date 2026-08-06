import { ErrorKind } from "@skiesjs/core";
import { describe, expect, it } from "vitest";
import { FakeExternalIdentity, type ExternalIdentity } from "./index.js";

describe("FakeExternalIdentity", () => {
  it.each(["", " ", "\t\n"])("rejects a blank token as unauthorized", async (idToken) => {
    const identity: ExternalIdentity = new FakeExternalIdentity();

    const result = await identity.verify(idToken);

    expect(result).toEqual({
      ok: false,
      error: {
        kind: ErrorKind.Unauthorized,
        code: "identity.invalid_token",
        message: "invalid identity token",
      },
    });
  });

  it("returns the provider-verified user without rewriting the token", async () => {
    const identity: ExternalIdentity = new FakeExternalIdentity();

    const result = await identity.verify(" user@example.com ");

    expect(result).toEqual({
      ok: true,
      value: {
        provider: "fake",
        subject: " user@example.com ",
        email: " user@example.com ",
      },
    });
  });

  it("honors an aborted verification request", async () => {
    const identity: ExternalIdentity = new FakeExternalIdentity();
    const controller = new AbortController();
    controller.abort(new Error("verification cancelled"));

    await expect(identity.verify("user@example.com", controller.signal)).rejects.toThrow("verification cancelled");
  });
});
