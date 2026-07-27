import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, expect, it } from "vitest";
// @ts-expect-error - plain .mjs tool module, typed by its JSDoc
import { renderFeedback, renderMutator, renderOrvalConfig, renderQueryClient } from "./client-scaffold.mjs";
// @ts-expect-error - the CommonJS plugin, loaded for the conformance proof below
import skies from "../packages/eslint-plugin/index.cjs";

// The mutator/config pair every pilot re-derived by hand — rendered conformant by construction. What is
// pinned: the seams the harness depends on, and the SKYFE020-blessed base-URL shape.
describe("client-scaffold", () => {
  it("the mutator injects the base URL at boot, never baking a host into the construction", () => {
    const mutator = renderMutator();

    // SKYFE020's blessed shape: an injectable default on instance.defaults, no baseURL: in axios.create.
    expect(mutator).toContain("instance.defaults.baseURL =");
    expect(mutator).not.toMatch(/axios\.create\(\{[^}]*baseURL/s);
    expect(mutator).toContain("export function configureClient");
  });

  it("the mutator carries the auth seams: setAccessToken sink + bearer injection", () => {
    const mutator = renderMutator();

    expect(mutator).toContain("export function setAccessToken");
    expect(mutator).toContain("Authorization: `Bearer ${accessToken}`");
  });

  it("web opts into the cookie session via X-Client, with credentials riding cross-origin", () => {
    const mutator = renderMutator();

    expect(mutator).toContain('"X-Client": "web"');
    expect(mutator).toContain("withCredentials: true");
  });

  it("the orval config wires the mutator, filters non-app audiences, and targets client.gen", () => {
    const config = renderOrvalConfig("shop", "./contract/Shop.Api.json");

    expect(config).toContain('target: "./contract/Shop.Api.json"');
    expect(config).toContain('tags: ["skies:asset", "skies:webhook", "skies:internal"]');
    expect(config).toContain('mutator: { path: "./src/lib/skies-client.ts", name: "skiesClient" }');
    expect(config).toContain('target: "./src/client.gen/shop.ts"');
  });

  it("the orval config leaves writes as mutations — no query override that would force every op to useQuery", () => {
    const config = renderOrvalConfig("shop", "./contract/Shop.Api.json");

    // Scar frontend/3d49a75f: query: { useQuery: true, useMutation: true } does NOT mean "both, by verb" — on
    // orval 8.20 it forces EVERY operation (including POST/PUT/PATCH/DELETE) into a useQuery hook, so writes lose
    // their mutation shape (.mutate, isPending) and the deposit/form recipe has nothing to bind to. The cure is
    // the ABSENCE of the override: orval's verb-based default gives GET → useQuery, writes → useMutation. Guard
    // it here so the flag pair can never be re-introduced.
    expect(config).not.toMatch(/query:\s*\{/);
    expect(config).not.toContain("useQuery");
    expect(config).not.toContain("useMutation");
  });

  it("the QueryClient carries the write-side defaults: invalidate on success, feedback on error", () => {
    const query = renderQueryClient();

    // The convention's two halves: success marks the world stale + posts the note (meta.silent opts out of the
    // note only); failure always surfaces, with meta.expectedFailure as the ONLY error opt-out — and it is for
    // failures modeled as visible state, never for hiding real errors. `silent` must NOT reach onError.
    expect(query).toContain("void queryClient.invalidateQueries();");
    expect(query).toContain("mutation.meta?.silent !== true");
    expect(query).toContain("mutation.meta?.expectedFailure !== true");
    expect(query).not.toMatch(/onError:[\s\S]*?meta\?\.silent\b/);
  });

  it("the mutator delegates rotation to the injected seam: a once-only 401 replay, the auth routes exempt", () => {
    const mutator = renderMutator();

    // The rotation door is INJECTED, not baked: the shell registers the seam's single-flight bootstrapSession,
    // so the same interceptor serves cookie AND body modes and the rotation logic lives in exactly one place.
    expect(mutator).toContain("export function setTokenRefresher");
    expect(mutator).toContain("await refreshSession()");
    // …and the mutator no longer forks a cookie-only rotation path — no baked refresh route, no second
    // single-flight duplicating the seam's (2-pilot evidence: pauta direct-post vs hostpoint injected).
    expect(mutator).not.toContain("refreshAccessToken");
    expect(mutator).not.toContain("REFRESH_PATH");
    // The interceptor replays at most once and exempts the auth routes, so an anonymous caller settles to 401.
    expect(mutator).toContain("_retried");
    expect(mutator).toContain("isAuthRoute");
  });

  it("the feedback seam exposes one door with a visible (console) fallback until the shell wires a sink", () => {
    const feedback = renderFeedback();

    expect(feedback).toContain("export function wireFeedback");
    expect(feedback).toContain("export const feedback: FeedbackSink");
    expect(feedback).toContain("console.error");
  });

  it("the rendered lib/query.ts passes SKYFE027 — conformant by construction, proved with the real rule", () => {
    const linter = new Linter();
    const lint = (code: string, filename: string) =>
      linter.verify(
        code,
        {
          files: ["**/*.ts"],
          languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module" },
          plugins: { skies },
          rules: { "skies/query-client-defaults": "error" },
        },
        { filename },
      );

    expect(lint(renderQueryClient(), "src/lib/query.ts")).toEqual([]);
    // …and the gate actually fires on this surface: the pilot's bare client is caught.
    expect(lint("export const queryClient = new QueryClient();", "src/lib/queryClient.ts")).toHaveLength(1);
  });
});
