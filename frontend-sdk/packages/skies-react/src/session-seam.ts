// The session's WRITE side — the one seam SKYFE016 polices toward, graduated from the hostpoint pilot's
// lib/session. The read side (SessionState/toSessionState) projects "who is signed in"; this owns "the token
// changed": persist it, and reset the session cache IN THE SAME MOVE, so the scattered-write bug (a sign-in
// that forgets to reset the `me` query and bounces the fresh user back to login) is unrepresentable, not
// merely linted. Structural like the rest of the spine: the client call, the token sink, and the storage are
// injected ports — the spine depends on no transport, no router, no storage API.

import { singleFlight } from "./single-flight";

/** Where the refresh token lives between runs — the platform seam. Web apps omit it entirely (the refresh
 * token is an httpOnly cookie, invisible to JS by design); native apps back it with secure storage. */
export interface RefreshTokenStore {
  /** The persisted refresh token, or empty when there is none. */
  load: () => Promise<string>;
  /** Persist a (rotated) refresh token. */
  save: (token: string) => Promise<void>;
  /** Drop the persisted token on sign-out. */
  clear: () => Promise<void>;
}

/** The capabilities a session seam composes over, injected so the spine stays dependency-free. */
export interface SessionSeamPorts {
  /** Sink for the bearer token (e.g. the generated client's `setAccessToken`); `null` clears it. */
  setAccessToken: (token: string | null) => void;
  /** Re-mint tokens from a refresh token (the generated `refresh` endpoint). The argument is empty on web,
   * where the cookie rides the request instead. */
  refresh: (refreshToken: string) => Promise<AuthTokens | null | undefined>;
  /** ROTATION reset — LIGHT. The SAME identity got a fresh token (a boot bootstrap, a 401-refresh), so only the
   * session-shaped caches need re-reading (e.g. `queryClient.resetQueries` over `me`); the rest of the cache is
   * still that user's and stays warm — no blank flash. Runs on {@link SessionSeam.bootstrapSession}. */
  onSessionChanged?: () => void;
  /** IDENTITY reset — TOTAL. The identity ITSELF changed: an explicit sign-in (a DIFFERENT user may have
   * authenticated on this client) or a sign-out. Wipe the whole cache (e.g. `queryClient.clear()`) so the prior
   * user's data can never bleed into the next session — the hostpoint bug that a sign-out→sign-in on one client
   * leaked user A's cache to user B, "fixed" there by splitting the app in two. Runs on {@link SessionSeam.signIn}
   * and {@link SessionSeam.clearSession}. Required because substituting the light rotation reset recreates the
   * cross-identity cache leak this split exists to prevent. */
  onIdentityChanged: () => void;
  /** The platform token store; omitted = the web posture (httpOnly cookie, nothing stored in JS). */
  store?: RefreshTokenStore;
}

/** The token pair a login/refresh response carries; either half may be absent (web carries no body refresh). */
export interface AuthTokens {
  accessToken?: string;
  refreshToken?: string;
}

/** The seam's surface — the only ways the app may move the session. The two authenticating doors are split on
 * purpose: an explicit {@link signIn} is an IDENTITY change (total wipe), while
 * {@link bootstrapSession} is a ROTATION (light reset). */
export interface SessionSeam {
  /** Persist a session from an explicit SIGN-IN / sign-up response: bearer to the sink, rotated refresh to the
   * store, then the IDENTITY reset (total wipe) — a different user may have authenticated on this client, so the
   * prior user's cache is dropped entirely before the fresh `me` refetches. This is the identity door; the app
   * literally cannot authenticate a user without the wipe. */
  signIn: (result: unknown) => Promise<void>;
  /** Re-mint the access token from the persisted refresh (cookie on web, stored body on native) — a ROTATION of
   * the SAME identity, so only the light reset runs and the screen stays warm. Returns whether a session was
   * restored. Safe on every app start — the API rotates the refresh token and the seam re-saves it, so the next
   * bootstrap uses the latest one. */
  bootstrapSession: () => Promise<boolean>;
  /** Drop the session locally (the server clears the cookie / revokes on its side) — an IDENTITY change (total
   * wipe): the next user starts on a clean cache. */
  clearSession: () => Promise<void>;
}

const noStore: RefreshTokenStore = {
  load: () => Promise.resolve(""),
  save: () => Promise.resolve(),
  clear: () => Promise.resolve(),
};

/**
 * Build the app's session seam (its `lib/session`) from the injected ports:
 *
 * ```ts
 * export const session = createSessionSeam({
 *   setAccessToken,
 *   refresh: (token) => refresh({ refreshToken: token }),
 *   // rotation: light — the same user, a fresh token; keep the screen warm.
 *   onSessionChanged: () => queryClient.resetQueries({ queryKey: getMeQueryKey() }),
 *   // identity: total — a different user may have signed in / out; drop everything.
 *   onIdentityChanged: () => queryClient.clear(),
 *   // store: secureStore  // native only; web omits it (httpOnly cookie)
 * });
 * ```
 */
export function createSessionSeam(ports: SessionSeamPorts): SessionSeam {
  const store = ports.store ?? noStore;

  const persistTokens = async (result: unknown): Promise<void> => {
    const tokens = (result ?? undefined) as AuthTokens | undefined;
    if (tokens?.accessToken) ports.setAccessToken(tokens.accessToken);
    if (tokens?.refreshToken) await store.save(tokens.refreshToken);
  };

  const signIn = async (result: unknown): Promise<void> => {
    await persistTokens(result);
    ports.onIdentityChanged(); // a (possibly) new identity — wipe the prior user's cache entirely
  };

  // Single-flighted: a cold start that double-invokes the boot effect (React StrictMode in dev) or a bootstrap
  // racing the client's 401-interceptor would otherwise fire TWO refresh rotations — and the backend's
  // theft-detection burns the whole session family when it sees the spent token replayed (the SKYFE029 hazard at
  // boot). Concurrent callers share the one rotation; the gate reopens once it settles, so a later, genuine
  // re-bootstrap still runs.
  const bootstrapSession = singleFlight(async (): Promise<boolean> => {
    try {
      await persistTokens(await ports.refresh(await store.load()));
      ports.onSessionChanged?.(); // rotation of the SAME identity — light reset, not the identity wipe
      return true;
    } catch {
      return false;
    }
  });

  return {
    signIn,
    bootstrapSession,
    async clearSession() {
      ports.setAccessToken(null);
      await store.clear();
      ports.onIdentityChanged(); // the identity is gone — wipe so the next user starts clean
    },
  };
}
