#!/usr/bin/env node
// SKYFE — the generated client's hand-owned half. orval generates the hooks, but the MUTATOR they all call
// through (auth injection, base-URL port, the X-Client header that turns on the web cookie session), the
// orval config itself, AND the QueryClient + feedback seam every mutation rides are hand-owned files nothing
// scaffolded — every pilot re-derived them (and the one that re-derived the QueryClient bare shipped the
// created-it-but-only-saw-it-after-F5 bug). This renders all four, conformant by construction: the base URL is
// an injectable default overridden at boot via configureClient() (the SKYFE020-blessed shape — never a baked
// host in axios.create), the token sink is the seam's setAccessToken, the 401 rotation is the seam's
// single-flight bootstrapSession injected via setTokenRefresher (one door, cookie AND body — never a
// cookie-only fork baked into this transport file), the audience filter keeps non-app endpoints out of the
// client (so SKYFE008 stays high-signal), and the QueryClient carries the write-side
// mutation defaults — invalidate on success, feedback on error (the SKYFE027-blessed shape). Graduated from the
// hostpoint pilot's skies-client.ts + orval.config.ts and the pauta pilot's state-management gap.
//
// Usage: node tools/client-scaffold.mjs <client-name> <contract-path> [target-dir]
//   node tools/client-scaffold.mjs hostpoint ./contract/Hostpoint.Api.json ../app-core/src

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** The orval mutator + client seam (lib/skies-client.ts) — the single HTTP door every generated hook calls. */
export function renderMutator() {
  return `import axios, {
  type AxiosRequestConfig,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";

// Web detection without importing react-native's Platform (which would pull the RN runtime into the
// platform-agnostic data-door path + the jsdom test env). \`document\` exists only on web/DOM.
const isWeb = typeof document !== "undefined";

// The single HTTP seam every generated slice-hook calls through — the orval mutator. The opinion lives here
// (not in a fork of any tool): the base URL, the bearer token, and a uniform error shape. The generated
// *.gen.ts hooks are boring plumbing on top of this; all behaviour lives above, in the ViewModels.
//
// withCredentials so the session cookie (set by the API on login) rides cross-origin requests. X-Client: web
// is the Skies.Framework.Auth convention: the API delivers the refresh token as an httpOnly cookie ONLY when the
// request carries it; without it the refresh rides the response body (the native mode) and the web cookie
// session never forms.
const instance = axios.create({
  withCredentials: true,
  headers: isWeb ? { "X-Client": "web" } : {},
});

// The base URL is INJECTED by the platform shell at boot (configureClient), never read from platform config
// here — so this data-door module stays platform-agnostic. The localhost default keeps tests + pre-configure
// dev working; SKYFE020 blesses exactly this injectable-default shape.
instance.defaults.baseURL = "http://localhost:8080";

/** Point the client at the resolved API base URL. Called once at app start by the shell — the same
 * push-don't-pull seam as setAccessToken; the data layer never imports platform config. */
export function configureClient(apiUrl: string): void {
  if (apiUrl) instance.defaults.baseURL = apiUrl;
}

let accessToken: string | null = null;

/** Set (or clear) the bearer token the client sends — called only by the session seam (lib/session). */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

// ── Token refresh — the SEAM rotates, the client only retries (SKYFE029: refresh-one-door) ───────────────
// The 401 interceptor restores the session transparently, but it does NOT know HOW to rotate. Cookie mode
// (web: an empty post, the refresh rides the httpOnly cookie) and body mode (native: the secure-stored refresh
// token) are the session seam's concern — and it rotates SINGLE-FLIGHT there (its bootstrapSession), so
// concurrent 401s share ONE in-flight rotation instead of replaying a spent token and tripping the backend's
// theft detection (which burns the whole session family). The shell registers that rotation here at boot; the
// same injected door serves cookie and body alike, and the rotation logic lives in exactly one place — the
// seam, never forked into this transport file. Until the shell wires it, a 401 settles to 401.
type TokenRefresher = () => Promise<boolean>;
let refreshSession: TokenRefresher | null = null;

/** Register the session seam's rotation (its single-flighted \`bootstrapSession\`) as the 401 refresher —
 * called once at boot by the shell: \`setTokenRefresher(session.bootstrapSession)\`. The refresher rotates and
 * pushes the fresh bearer through \`setAccessToken\`; it resolves true when a live session was restored. */
export function setTokenRefresher(refresher: TokenRefresher): void {
  refreshSession = refresher;
}

// On a 401, transparently rotate once (through the injected seam) and replay the request — restores the
// session on a cold load (the in-memory bearer is gone, the refresh credential survives) and rides over a
// mid-session expiry without bouncing to login. The auth routes are exempt and each request retries at most
// once, so a genuinely anonymous caller settles to 401 instead of looping.
instance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const url = original?.url ?? "";
    const isAuthRoute = url.includes("/refresh") || url.includes("/login");
    if (error.response?.status === 401 && original && !original._retried && !isAuthRoute && refreshSession) {
      original._retried = true;
      // The seam rotates (single-flight) and pushes the new bearer through setAccessToken; replay with it.
      const restored = await refreshSession();
      if (restored && accessToken) {
        original.headers.set("Authorization", \`Bearer \${accessToken}\`);
        return instance.request(original);
      }
    }
    return Promise.reject(error);
  },
);

/** The mutator orval wires every endpoint through: inject auth, return the body. */
export const skiesClient = async <T>(config: AxiosRequestConfig): Promise<T> => {
  const response = await instance.request<T>({
    ...config,
    headers: {
      ...config.headers,
      ...(accessToken ? { Authorization: \`Bearer \${accessToken}\` } : {}),
    },
  });
  return response.data;
};

export default skiesClient;
`;
}

/** The feedback seam (lib/feedback.ts) — the one door for transient user feedback (SKYFE016's shape, applied to toasts). */
export function renderFeedback() {
  return `// The one door for transient user feedback (toasts/banners) — the "one seam" shape (SKYFE016) applied to
// notifications. The app picks its toast library and wires it ONCE at boot (wireFeedback); everything below
// the shell — the mutation defaults in lib/query.ts, any ViewModel — speaks to this seam and never imports a
// toast lib directly. Swapping the library is a one-file change no ViewModel notices.

/** What a feedback sink renders. The shell provides one at boot (e.g. sonner's toast.success / toast.error). */
export interface FeedbackSink {
  success(message: string): void;
  error(message: string): void;
}

// Until the shell wires a real sink, errors fall back to the console — feedback degrades visibly, never
// silently (a dev booting without wireFeedback still sees every failure).
let sink: FeedbackSink = {
  success: () => undefined,
  error: (message) => console.error(\`[feedback] \${message}\`),
};

/** Install the app's toast sink — called once at boot by the shell. */
export function wireFeedback(next: FeedbackSink): void {
  sink = next;
}

/** The seam the mutation defaults (and any ViewModel) call — success and error notes through one door. */
export const feedback: FeedbackSink = {
  success: (message) => sink.success(message),
  error: (message) => sink.error(message),
};
`;
}

/** The QueryClient factory (lib/query.ts) — the write-side mutation defaults, the SKYFE027-blessed shape. */
export function renderQueryClient() {
  return `import { MutationCache, QueryClient } from "@tanstack/react-query";

import { feedback } from "./feedback";

// The write-side defaults the convention pins (SKYFE027). A successful mutation marks EVERY query stale
// (TanStack refetches the active ones immediately), so no screen hand-rolls \`onSuccess: refetch\` and no list
// is ever one F5 behind its server — the safe, slightly-wasteful default that is always correct. A failed
// mutation always surfaces through the feedback seam — the global half of SKYFE013 (no silent failure).
// Targeted invalidation and optimistic updates remain the per-screen opt-in LAYERED ABOVE this default for the
// screen that proves it needs them, never a replacement for it.

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** Skip the success note for this mutation (a sign-in, a drag reorder — the UI change IS the feedback). */
      silent?: boolean;
      /** Skip the ERROR note — legal ONLY when the failure is a modeled, visible state the screen renders
       * (an anonymous probe settling onto the login screen), never a way to hide a real failure. */
      expectedFailure?: boolean;
    };
  }
}

/** The copy the defaults speak — resolved by the shell (i18n), so this seam carries no i18n dependency. */
export interface MutationCopy {
  /** The generic success note ("Saved"). */
  saved(): string;
  /** The failure note — receives the error so the app can map an ErrorBody code to localized copy. */
  failed(error: unknown): string;
}

/** Build the app's QueryClient with the convention's mutation defaults wired (SKYFE027). */
export function createQueryClient(copy: MutationCopy): QueryClient {
  const queryClient: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _context, mutation) => {
        void queryClient.invalidateQueries();
        if (mutation.meta?.silent !== true) feedback.success(copy.saved());
      },
      // A mutation failure ALWAYS surfaces — the only opt-out is \`meta.expectedFailure\`, for the mutation
      // whose failure is a modeled, visible state (not an error to announce). A screen that also reads
      // .isError just adds a richer inline surface on top — double feedback beats the silent kind.
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.expectedFailure !== true) feedback.error(copy.failed(error));
      },
    }),
  });
  return queryClient;
}
`;
}

/** The orval convention config — one typed TanStack hook per slice, audience-filtered, mutator-wired. */
export function renderOrvalConfig(name, contract) {
  return `import { defineConfig } from "orval";

// The shipped convention config. Generates one typed TanStack Query hook per slice from the .NET API's
// build-time OpenAPI contract (no running server needed). The generated code is plumbing: never hand-edited,
// committed verbatim; all behavior lives above it, in the ViewModels. After generating, stamp the contract
// (tools/contract-freshness.mjs --stamp) so the doctor can prove the mirror is fresh.
export default defineConfig({
  ${name}: {
    input: {
      target: "${contract}",
      // Audience filter: webhooks/internal endpoints carry an skies:* tag (WithEndpointKind on the backend)
      // and never become a hook — so they never trip the SKYFE008 loose-endpoint warning.
      filters: { mode: "exclude", tags: ["skies:asset", "skies:webhook", "skies:internal"] },
    },
    output: {
      mode: "split",
      target: "./src/client.gen/${name}.ts",
      schemas: "./src/client.gen/model",
      client: "react-query",
      httpClient: "axios",
      clean: true,
      prettier: false,
      override: {
        mutator: { path: "./src/lib/skies-client.ts", name: "skiesClient" },
        // No hook-kind override on purpose: orval's verb-based default IS the convention — GET verbs
        // generate a read hook, write verbs (POST/PUT/PATCH/DELETE) generate a mutation hook with
        // { data: <Input> } variables. Do NOT add an override that forces both hook kinds on every
        // operation: on orval 8.20 that turns every endpoint into a read hook, silently stripping the
        // write path of its mutation shape (.mutate / isPending) so the deposit/form recipe cannot bind.
      },
    },
  },
});
`;
}

// ── CLI tail (the only I/O) ─────────────────────────────────────────────────────────────────────────────────────
const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (invokedDirectly) {
  const [, , name, contract, targetDir = "."] = process.argv;
  if (!name || !contract) {
    console.error("usage: node tools/client-scaffold.mjs <client-name> <contract-path> [target-dir]");
    process.exit(2);
  }
  const mutatorPath = join(targetDir, "src", "lib", "skies-client.ts");
  const feedbackPath = join(targetDir, "src", "lib", "feedback.ts");
  const queryPath = join(targetDir, "src", "lib", "query.ts");
  const orvalPath = join(targetDir, "orval.config.ts");
  for (const [path, content] of [
    [mutatorPath, renderMutator()],
    [feedbackPath, renderFeedback()],
    [queryPath, renderQueryClient()],
    [orvalPath, renderOrvalConfig(name, contract)],
  ]) {
    if (existsSync(path)) {
      console.error(`client-scaffold: ${path} already exists — hand-owned, not overwritten.`);
      continue;
    }
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
    console.log(`created ${path}`);
  }
}
