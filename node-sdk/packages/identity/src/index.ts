import { Errors, Result, type Result as ResultOutcome } from "@skiesjs/core";

/** A provider-verified user whose subject is stable within that provider. */
export interface ExternalUser {
  /** The provider that verified the identity, such as `google`. */
  readonly provider: string;
  /** The provider's stable, unique identifier for the user. */
  readonly subject: string;
  /** The email address verified by the provider. */
  readonly email: string;
}

/**
 * Verifies an OIDC identity token without coupling application code to a provider SDK.
 * Provider integrations implement this port and honor cancellation through the supplied signal.
 */
export interface ExternalIdentity {
  /** Verify an identity token and return either the vouched-for user or an expected failure. */
  verify(idToken: string, signal?: AbortSignal): Promise<ResultOutcome<ExternalUser>>;
}

/**
 * A development and test verifier that treats a nonblank token as the user's subject and email.
 * Production applications replace it with a verifier that validates tokens against provider keys.
 */
export class FakeExternalIdentity implements ExternalIdentity {
  /** Verify a fake token while preserving the production port's asynchronous contract. */
  public async verify(idToken: string, signal?: AbortSignal): Promise<ResultOutcome<ExternalUser>> {
    signal?.throwIfAborted();

    if (idToken.trim().length === 0) {
      return Result.fail(Errors.unauthorized("identity.invalid_token", "invalid identity token"));
    }

    return Result.ok({ provider: "fake", subject: idToken, email: idToken });
  }
}
