import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  checkE2e,
  checkListedWebFlows,
  classifySpec,
  parsePlaywrightList,
} from "./e2e-doctor.mjs";

// The e2e doctor enforces "completeness via curated checklist": a curated flow with no spec is a gap; a fully
// covered manifest is clean. Absence, skips, pending seed data and shallow flows are all blocking.
function tmp() {
  return mkdtempSync(join(process.cwd(), "tools", ".e2e-doctor-tmp-"));
}

function writeContract(dir: string, operationIds = ["Login", "Me"]) {
  mkdirSync(join(dir, "contract"));
  const paths = Object.fromEntries(operationIds.map((operationId) => [
    `/${operationId.toLowerCase()}`,
    { post: { operationId } },
  ]));
  writeFileSync(join(dir, "contract", "api.json"), JSON.stringify({ openapi: "3.1.0", paths }));
}

describe("checkE2e", () => {
  it("rejects a Playwright config that always reuses an existing server", () => {
    const dir = tmp();
    try {
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "playwright.config.ts"), "export default { webServer: { reuseExistingServer: true } };");
      writeFileSync(
        join(dir, "e2e", "login.spec.ts"),
        'test("login", async ({ page }) => { await page.goto("/login"); await expect(page).toHaveURL("/home"); });',
      );
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([{
        id: "login", name: "login", path: "happy", target: "web", terminal: "/home",
        spec: "e2e/login.spec.ts", case: "login", features: ["Login"],
        criteria: [{ id: "authenticates-valid-credentials", evidence: "/home" }],
      }]));

      const result = checkE2e(dir);
      expect(result.gaps).toBe(1);
      expect(result.messages.join(" ")).toContain("stale or unrelated process");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires ViewModel journeys to name the AVP/Assay criteria they prove", () => {
    const dir = tmp();
    try {
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};");
      writeFileSync(
        join(dir, "e2e", "login.spec.ts"),
        'test("login", async ({ page }) => { await page.goto("/login"); await expect(page).toHaveURL("/home"); });',
      );
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([{
        id: "login", name: "login", path: "happy", target: "web", terminal: "/home",
        spec: "e2e/login.spec.ts", case: "login", features: ["Login"],
      }]));

      const missing = checkE2e(dir);
      expect(missing.gaps).toBeGreaterThan(0);
      expect(missing.messages.join(" ")).toContain("declares no AVP/Assay criteria");

      const flows = JSON.parse(readFileSync(join(dir, "e2e", "flows.json"), "utf8"));
      flows[0].criteria = [{ id: "authenticates-valid-credentials", evidence: "/home" }];
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify(flows));
      expect(checkE2e(dir).gaps).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires every criterion to name distinct evidence asserted by its exact case", () => {
    const dir = tmp();
    try {
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};");
      writeFileSync(
        join(dir, "e2e", "checkout.spec.ts"),
        'test("checkout", async ({ page }) => { await expect(page).toHaveURL("/complete"); });',
      );
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([{
        id: "checkout", name: "checkout", path: "happy", target: "web", terminal: "/complete",
        spec: "e2e/checkout.spec.ts", case: "checkout", features: ["Checkout"],
        criteria: [{ id: "charges-once", evidence: "receipt" }],
      }]));

      const missing = checkE2e(dir);
      expect(missing.gaps).toBe(1);
      expect(missing.messages.join(" ")).toContain("never asserts the declared evidence");

      const flows = JSON.parse(readFileSync(join(dir, "e2e", "flows.json"), "utf8"));
      flows[0].criteria = [{ id: "charges-once", evidence: "/complete" }];
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify(flows));
      expect(checkE2e(dir).gaps).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects legacy string criteria and one assertion reused by multiple criteria", () => {
    const dir = tmp();
    try {
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};");
      writeFileSync(
        join(dir, "e2e", "checkout.spec.ts"),
        'test("checkout", async ({ page }) => { await expect(page).toHaveURL("/complete"); });',
      );
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([{
        id: "checkout", name: "checkout", path: "happy", target: "web", terminal: "/complete",
        spec: "e2e/checkout.spec.ts", case: "checkout", features: ["Checkout"],
        criteria: ["legacy", { id: "charges-once", evidence: "/complete" },
          { id: "shows-receipt", evidence: "/complete" }],
      }]));

      const result = checkE2e(dir);
      expect(result.gaps).toBeGreaterThan(0);
      expect(result.messages.join(" ")).toContain("distinct { id, evidence } entries");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks when there is no e2e/flows.json", () => {
    const dir = tmp();
    try {
      const result = checkE2e(dir);
      expect(result.gaps).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is clean when every curated flow has a spec and a runner is configured", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        { id: "welcome", name: "welcome", path: "happy", target: "web", terminal: "/home", spec: "e2e/welcome.spec.ts" },
      ]));
      writeFileSync(join(dir, "e2e", "welcome.spec.ts"), 'await expect(page).toHaveURL("/home");\n');
      const r = checkE2e(dir);
      expect(r.gaps).toBe(0);
      expect(r.flows).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires the fail-closed Playwright fixture in a Skies frontend", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({
        devDependencies: { "@skiesjs/frontend-sdk": "4.0.0" },
      }));
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        { id: "welcome", name: "welcome", path: "happy", target: "web", terminal: "/home", spec: "e2e/welcome.spec.ts" },
      ]));
      writeFileSync(join(dir, "e2e", "welcome.spec.ts"), [
        'import { expect, test } from "@playwright/test";',
        'test("welcome", async ({ page }) => expect(page).toHaveURL("/home"));',
      ].join("\n"));

      const result = checkE2e(dir);

      expect(result.messages.join(" ")).toContain("@skiesjs/frontend-sdk/playwright");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts the canonical fail-closed Playwright fixture", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({
        devDependencies: { "@skiesjs/frontend-sdk": "4.0.0" },
      }));
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        { id: "welcome", name: "welcome", path: "happy", target: "web", terminal: "/home", spec: "e2e/welcome.spec.ts" },
      ]));
      writeFileSync(join(dir, "e2e", "welcome.spec.ts"), [
        'import { expect, test } from "@skiesjs/frontend-sdk/playwright";',
        'test("welcome", async ({ page }) => expect(page).toHaveURL("/home"));',
      ].join("\n"));

      expect(checkE2e(dir).gaps).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flags a curated flow whose spec is missing", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        { id: "checkout", name: "checkout", path: "happy", target: "web", terminal: "/done", spec: "e2e/checkout.spec.ts" },
      ]));
      const r = checkE2e(dir);
      expect(r.gaps).toBeGreaterThan(0);
      expect(r.messages.join(" ")).toContain("checkout");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flags a missing runner config", () => {
    const dir = tmp();
    try {
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        { id: "welcome", name: "welcome", path: "happy", target: "web", terminal: "/home", spec: "e2e/welcome.spec.ts" },
      ]));
      writeFileSync(join(dir, "e2e", "welcome.spec.ts"), 'await expect(page).toHaveURL("/home");\n');
      const r = checkE2e(dir);
      expect(r.gaps).toBeGreaterThan(0);
      expect(r.messages.join(" ")).toContain("runner");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("derives Maestro from target:native and accepts its canonical YAML flow", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { "test:e2e": "maestro test e2e" } }));
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        { id: "login", name: "login", path: "happy", target: "native", terminal: "Home", spec: "e2e/login.yaml" },
      ]));
      writeFileSync(join(dir, "e2e", "login.yaml"), "appId: com.example\n- launchApp\n- assertVisible: Home\n");
      const r = checkE2e(dir);
      expect(r.runners).toContain("maestro");
      expect(r.gaps).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is target-aware — a target:native flow with only a web runner is a gap", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n"); // web runner only
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        { id: "cold-start", name: "cold start", path: "happy", target: "native", terminal: "Home", spec: "e2e/cold.yaml" },
      ]));
      writeFileSync(join(dir, "e2e", "cold.yaml"), "appId: com.example\n- launchApp\n- assertVisible: Home\n");
      const r = checkE2e(dir);
      expect(r.gaps).toBeGreaterThan(0);
      expect(r.messages.join(" ")).toContain("canonical `maestro test e2e` runner");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not accept an empty Maestro directory as runner configuration", () => {
    const dir = tmp();
    try {
      mkdirSync(join(dir, ".maestro"));
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        { id: "login", name: "login", path: "happy", target: "native", terminal: "Home", spec: "e2e/login.yaml" },
      ]));
      writeFileSync(join(dir, "e2e", "login.yaml"), "appId: com.example\n- launchApp\n- assertVisible: Home\n");

      const result = checkE2e(dir);

      expect(result.runners).not.toContain("maestro");
      expect(result.gaps).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a canonical runner with no flow for its target", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { "test:e2e": "playwright test && maestro test e2e" } }));
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        { id: "welcome", name: "welcome", path: "happy", target: "web", terminal: "/home", spec: "e2e/welcome.spec.ts" },
      ]));
      writeFileSync(join(dir, "e2e", "welcome.spec.ts"), 'await expect(page).toHaveURL("/home");\n');

      const result = checkE2e(dir);

      expect(result.gaps).toBeGreaterThan(0);
      expect(result.messages.join(" ")).toContain("no target:native proof");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ["cypress.config.ts", "export default {};", "cypress"],
    [".detoxrc.js", "module.exports = {};", "detox"],
  ])("rejects noncanonical runner configuration %s", (config, source, runner) => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      writeFileSync(join(dir, config), source);
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        { id: "welcome", name: "welcome", path: "happy", target: "web", terminal: "/home", spec: "e2e/welcome.spec.ts" },
      ]));
      writeFileSync(join(dir, "e2e", "welcome.spec.ts"), 'await expect(page).toHaveURL("/home");\n');

      const result = checkE2e(dir);

      expect(result.gaps).toBeGreaterThan(0);
      expect(result.messages.join(" ")).toContain(`noncanonical ${runner}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ["web", "e2e/welcome.yaml", "Playwright"],
    ["native", "e2e/welcome.spec.ts", "Maestro"],
  ])("rejects a %s flow implemented in the other target's format", (target, spec, runner) => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, ".maestro"));
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        { id: "welcome", name: "welcome", path: "happy", target, terminal: "Home", spec },
      ]));
      writeFileSync(join(dir, spec), "await expect(page).toHaveURL('Home');\n");

      const result = checkE2e(dir);

      expect(result.gaps).toBeGreaterThan(0);
      expect(result.messages.join(" ")).toContain(runner);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Depth (SKYFE-JOURNEY-002): a spec existing is not coverage — a linked flow must drive its journey to a declared
  // terminal, and the spec must actually assert it. These are depthGaps (warn-tier), NOT hard existence gaps.
  it("flags a linked flow that declares no terminal — as a depth gap, not an existence gap", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeFileSync(
        join(dir, "e2e", "flows.json"),
        JSON.stringify([{ id: "onboarding", name: "onboarding", path: "happy", target: "web", spec: "e2e/onboarding.spec.ts" }]),
      );
      writeFileSync(join(dir, "e2e", "onboarding.spec.ts"), 'await expect(page).toHaveURL(/\\/onboarding/);\n');
      const r = checkE2e(dir);
      expect(r.gaps).toBe(0); // spec exists + runner present — existence is fine
      expect(r.depthGaps).toBe(1);
      expect(r.messages.join(" ")).toContain("terminal");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flags a flow whose spec never asserts its declared terminal (stops at entry)", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeFileSync(
        join(dir, "e2e", "flows.json"),
        JSON.stringify([
          { id: "onboarding", name: "onboarding", path: "happy", target: "web", terminal: "/dashboard", spec: "e2e/onboarding.spec.ts" },
        ]),
      );
      // The entry-only spec — asserts the wizard URL and stops; never references the /dashboard terminal.
      writeFileSync(join(dir, "e2e", "onboarding.spec.ts"), 'await expect(page).toHaveURL(/\\/onboarding/);\n');
      const r = checkE2e(dir);
      expect(r.gaps).toBe(0);
      expect(r.depthGaps).toBe(1);
      expect(r.messages.join(" ")).toContain("/dashboard");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is clean (no depth gap) when the spec asserts its declared terminal", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeFileSync(
        join(dir, "e2e", "flows.json"),
        JSON.stringify([
          { id: "onboarding", name: "onboarding", path: "happy", target: "web", terminal: "/dashboard", spec: "e2e/onboarding.spec.ts" },
        ]),
      );
      writeFileSync(
        join(dir, "e2e", "onboarding.spec.ts"),
        'await fillWizard(page);\nawait expect(page).toHaveURL("/dashboard");\n',
      );
      const r = checkE2e(dir);
      expect(r.gaps).toBe(0);
      expect(r.depthGaps).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows one spec to prove distinct named flow cases and rejects a missing case", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        {
          id: "login-happy", name: "login succeeds", path: "happy", target: "web",
          terminal: "/home", spec: "e2e/login.spec.ts", case: "signs in",
        },
        {
          id: "login-sad", name: "login rejects invalid credentials", path: "sad", target: "web",
          terminal: "invalid credentials", spec: "e2e/login.spec.ts", case: "rejects invalid credentials",
        },
      ]));
      writeFileSync(join(dir, "e2e", "login.spec.ts"), [
        'test("signs in", async ({ page }) => expect(page).toHaveURL("/home"));',
        'test("rejects invalid credentials", async ({ page }) => expect(page.getByText("invalid credentials")).toBeVisible());',
      ].join("\n"));
      expect(checkE2e(dir).gaps).toBe(0);

      const malformed = JSON.parse(readFileSync(join(dir, "e2e", "flows.json"), "utf8"));
      malformed[1].case = "not implemented";
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify(malformed));
      const result = checkE2e(dir);
      expect(result.gaps).toBe(1);
      expect(result.messages.join(" ")).toContain("not implemented");

      malformed[1].case = "rejects invalid credentials";
      malformed[0].terminal = "invalid credentials";
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify(malformed));
      const crossed = checkE2e(dir);
      expect(crossed.depthGaps).toBe(1);
      expect(crossed.messages.join(" ")).toContain("login succeeds");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("classifies backend-gated, seed-pending, front-only, disabled, focused, and native specs", () => {
    const dir = tmp();
    try {
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "backend.spec.ts"),
        'import { expectBackendSlices, observeBackend } from "@skiesjs/frontend-sdk/playwright-backend";\nconst backend = await observeBackend(page, "contract/api.json"); expectBackendSlices(backend, ["Login"], { status: "success" });\n');
      writeFileSync(join(dir, "e2e", "seed.spec.ts"),
        'import { expectBackendSlices, observeBackend } from "@skiesjs/frontend-sdk/playwright-backend";\nconst backend = await observeBackend(page, "contract/api.json"); expectBackendSlices(backend, ["Login"], { status: "success" }); requireSeed();\n');
      writeFileSync(join(dir, "e2e", "smoke.spec.ts"), "test('renders', () => {});\n");
      writeFileSync(join(dir, "e2e", "disabled.spec.ts"), "test.skip('later', () => {});\n");
      writeFileSync(join(dir, "e2e", "nested-disabled.spec.ts"), "test.each([1]).skip('later', () => {});\n");
      writeFileSync(join(dir, "e2e", "conditional.spec.ts"), "test.skipIf(!process.env.CI)('later', () => {});\n");
      writeFileSync(join(dir, "e2e", "focused.spec.ts"), "test.concurrent.only('alone', () => {});\n");
      writeFileSync(join(dir, "e2e", "focused-alias.spec.ts"), "fit('alone', () => {});\n");
      writeFileSync(join(dir, "e2e", "native.yaml"), "appId: com.example\n");
      expect(classifySpec(dir, "e2e/backend.spec.ts")).toBe("ci-gated");
      expect(classifySpec(dir, "e2e/seed.spec.ts")).toBe("seed-pending");
      expect(classifySpec(dir, "e2e/smoke.spec.ts")).toBe("front-only");
      expect(classifySpec(dir, "e2e/disabled.spec.ts")).toBe("disabled");
      expect(classifySpec(dir, "e2e/nested-disabled.spec.ts")).toBe("disabled");
      expect(classifySpec(dir, "e2e/conditional.spec.ts")).toBe("disabled");
      expect(classifySpec(dir, "e2e/focused.spec.ts")).toBe("disabled");
      expect(classifySpec(dir, "e2e/focused-alias.spec.ts")).toBe("disabled");
      expect(classifySpec(dir, "e2e/native.yaml")).toBe("native");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires the exact web case naming backend slices to run against the real backend", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeContract(dir);
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        {
          id: "login-happy", name: "login uses API", path: "happy", target: "web",
          terminal: "/home", spec: "e2e/login.spec.ts", case: "real login", backendSlices: ["Login"],
          backendContract: "contract/api.json",
        },
        {
          id: "profile-happy", name: "profile smoke", path: "happy", target: "web",
          terminal: "/profile", spec: "e2e/login.spec.ts", case: "mocked profile", backendSlices: ["Me"],
          backendContract: "contract/api.json",
        },
      ]));
      writeFileSync(join(dir, "e2e", "login.spec.ts"), [
        'import { expectBackendSlices, observeBackend } from "@skiesjs/frontend-sdk/playwright-backend";',
        'test("real login", async ({ page }) => { const backend = await observeBackend(page, "contract/api.json"); await expect(page).toHaveURL("/home"); expectBackendSlices(backend, ["Login"], { status: "success" }); });',
        'test("mocked profile", async ({ page }) => { await expect(page).toHaveURL("/profile"); });',
      ].join("\n"));

      const result = checkE2e(dir);

      expect(result.gaps).toBe(2);
      expect(result.execution["ci-gated"]).toBe(1);
      expect(result.execution["front-only"]).toBe(1);
      expect(result.messages.join(" ")).toContain("profile smoke");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects network mocks from a backend-bound spec even when the named case records operations", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeContract(dir, ["Login"]);
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        {
          id: "login-happy", name: "login uses API", path: "happy", target: "web",
          terminal: "/home", spec: "e2e/login.spec.ts", case: "signs in", backendSlices: ["Login"],
          backendContract: "contract/api.json",
        },
      ]));
      writeFileSync(join(dir, "e2e", "login.spec.ts"), [
        'import { expectBackendSlices, observeBackend } from "@skiesjs/frontend-sdk/playwright-backend";',
        'async function accountApi(page) { await page.route("**/account/**", route => route.fulfill({ status: 200 })); }',
        'test("signs in", async ({ page }) => { const backend = await observeBackend(page, "contract/api.json"); await accountApi(page); await expect(page).toHaveURL("/home"); expectBackendSlices(backend, ["Login"], { status: "success" }); });',
      ].join("\n"));

      const result = checkE2e(dir);

      expect(result.execution["ci-gated"]).toBe(1);
      expect(result.gaps).toBe(1);
      expect(result.messages.join(" ")).toContain("network mock");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects local no-op observation impersonators", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeContract(dir, ["Login"]);
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        {
          id: "login-happy", name: "login uses API", path: "happy", target: "web",
          terminal: "/home", spec: "e2e/login.spec.ts", case: "signs in", backendSlices: ["Login"],
          backendContract: "contract/api.json",
        },
      ]));
      writeFileSync(join(dir, "e2e", "login.spec.ts"), [
        "async function observeBackend() { return {}; }",
        "function expectBackendSlices() {}",
        'test("signs in", async ({ page }) => { const backend = await observeBackend(page, "contract/api.json"); await expect(page).toHaveURL("/home"); expectBackendSlices(backend, ["Login"], { status: "success" }); });',
      ].join("\n"));

      const result = checkE2e(dir);

      expect(result.execution["front-only"]).toBe(1);
      expect(result.gaps).toBe(1);
      expect(result.messages.join(" ")).toContain("@skiesjs/frontend-sdk/playwright-backend");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects backend proof metadata that disagrees with the flow or OpenAPI contract", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeContract(dir, ["Login"]);
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([{
        id: "login-sad", name: "login rejects credentials", path: "sad", target: "web",
        terminal: "invalid", spec: "e2e/login.spec.ts", case: "rejects credentials",
        backendSlices: ["Missing"], backendContract: "contract/api.json",
      }]));
      writeFileSync(join(dir, "e2e", "login.spec.ts"), [
        'import { expectBackendSlices, observeBackend } from "@skiesjs/frontend-sdk/playwright-backend";',
        'test("rejects credentials", async ({ page }) => { const backend = await observeBackend(page, "contract/api.json"); await expect(page.getByText("invalid")).toBeVisible(); expectBackendSlices(backend, ["Login"], { status: "success" }); });',
      ].join("\n"));

      const result = checkE2e(dir);

      expect(result.gaps).toBe(2);
      expect(result.messages.join(" ")).toContain("absent from");
      expect(result.messages.join(" ")).toContain('status:"error"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts canonical proof on a named page with multiline trailing commas", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeContract(dir, ["Login"]);
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([{
        id: "login-happy", name: "login", path: "happy", target: "web", terminal: "/home",
        spec: "e2e/login.spec.ts", case: "signs in", backendSlices: ["Login"],
        backendContract: "contract/api.json",
      }]));
      writeFileSync(join(dir, "e2e", "login.spec.ts"), [
        'import { observeBackend, waitForBackendSlices } from "@skiesjs/frontend-sdk/playwright-backend";',
        'test("signs in", async ({ browser }) => {',
        '  const traveler = await browser.newPage();',
        '  const backend = await observeBackend(traveler, "contract/api.json");',
        '  await expect(traveler).toHaveURL("/home");',
        '  await waitForBackendSlices(',
        '    backend,',
        '    ["Login"],',
        '    { status: "success" },',
        '  );',
        '});',
      ].join("\n"));

      const result = checkE2e(dir);

      expect(result.gaps).toBe(0);
      expect(result.execution["ci-gated"]).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts an exact proof after an intermediate wait for a subset", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeContract(dir, ["GetNotification", "MarkNotificationRead"]);
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([{
        id: "notification-happy", name: "notification", path: "happy", target: "web", terminal: "Recebida em",
        spec: "e2e/notification.spec.ts", case: "opens a notification",
        backendSlices: ["GetNotification", "MarkNotificationRead"], backendContract: "contract/api.json",
      }]));
      writeFileSync(join(dir, "e2e", "notification.spec.ts"), [
        'import { expectBackendSlices, observeBackend, waitForBackendSlices } from "@skiesjs/frontend-sdk/playwright-backend";',
        'test("opens a notification", async ({ page }) => {',
        '  const backend = await observeBackend(page, "contract/api.json");',
        '  await waitForBackendSlices(backend, ["GetNotification"], { status: "success" });',
        '  await expect(page.getByText("Recebida em")).toBeVisible();',
        '  expectBackendSlices(backend, ["GetNotification", "MarkNotificationRead"], { status: "success" });',
        '});',
      ].join("\n"));

      const result = checkE2e(dir);

      expect(result.gaps).toBe(0);
      expect(result.execution["ci-gated"]).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows a sad business state to prove a successful backend response explicitly", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeContract(dir, ["ListVisits"]);
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([{
        id: "visits-empty", name: "visits empty state", path: "sad", target: "web",
        terminal: "no visits", spec: "e2e/visits.spec.ts", case: "shows the empty state",
        backendSlices: ["ListVisits"], backendContract: "contract/api.json", backendOutcome: "success",
      }]));
      writeFileSync(join(dir, "e2e", "visits.spec.ts"), [
        'import { expectBackendSlices, observeBackend } from "@skiesjs/frontend-sdk/playwright-backend";',
        'test("shows the empty state", async ({ page }) => { const backend = await observeBackend(page, "contract/api.json"); await expect(page.getByText("no visits")).toBeVisible(); expectBackendSlices(backend, ["ListVisits"], { status: "success" }); });',
      ].join("\n"));

      const result = checkE2e(dir);

      expect(result.gaps).toBe(0);
      expect(result.depthGaps).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects an unknown backend outcome", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([{
        id: "visits-empty", name: "visits empty state", path: "sad", target: "web",
        terminal: "no visits", spec: "e2e/visits.spec.ts", backendOutcome: "sometimes",
      }]));
      writeFileSync(join(dir, "e2e", "visits.spec.ts"),
        'test("empty", async ({ page }) => expect(page.getByText("no visits")).toBeVisible());\n');

      const result = checkE2e(dir);

      expect(result.messages.join(" ")).toContain("invalid backendOutcome");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a direct fetch that bypasses the rendered feature", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeContract(dir, ["Login"]);
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([{
        id: "login-happy", name: "login uses API", path: "happy", target: "web",
        terminal: "/home", spec: "e2e/login.spec.ts", case: "signs in",
        backendSlices: ["Login"], backendContract: "contract/api.json",
      }]));
      writeFileSync(join(dir, "e2e", "login.spec.ts"), [
        'import { expectBackendSlices, observeBackend } from "@skiesjs/frontend-sdk/playwright-backend";',
        'test("signs in", async ({ page }) => { const backend = await observeBackend(page, "contract/api.json"); await page.evaluate(() => fetch("/login")); await expect(page).toHaveURL("/home"); expectBackendSlices(backend, ["Login"], { status: "success" }); });',
      ].join("\n"));

      const result = checkE2e(dir);

      expect(result.gaps).toBe(1);
      expect(result.messages.join(" ")).toContain("outside the visible page");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects direct calls and mocks hidden behind imported local helpers", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeContract(dir, ["Login"]);
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([{
        id: "login-happy", name: "login uses API", path: "happy", target: "web",
        terminal: "/home", spec: "e2e/login.spec.ts", case: "signs in",
        backendSlices: ["Login"], backendContract: "contract/api.json",
      }]));
      writeFileSync(join(dir, "e2e", "support.ts"), [
        'import { hiddenMock } from "./support/mock";',
        'export async function bypass(page) { hiddenMock(page); await page.evaluate(() => fetch("/login")); }',
      ].join("\n"));
      mkdirSync(join(dir, "e2e", "support"));
      writeFileSync(
        join(dir, "e2e", "support", "mock.ts"),
        'export function hiddenMock(page) { return page.route("**/login", route => route.fulfill({ status: 200 })); }\n',
      );
      writeFileSync(join(dir, "e2e", "login.spec.ts"), [
        'import { expectBackendSlices, observeBackend } from "@skiesjs/frontend-sdk/playwright-backend";',
        'import { bypass } from "./support";',
        'test("signs in", async ({ page }) => { const backend = await observeBackend(page, "contract/api.json"); await bypass(page); await expect(page).toHaveURL("/home"); expectBackendSlices(backend, ["Login"], { status: "success" }); });',
      ].join("\n"));

      const result = checkE2e(dir);

      expect(result.gaps).toBe(2);
      expect(result.messages.join(" ")).toContain("network mock");
      expect(result.messages.join(" ")).toContain("outside the visible page");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows network mocks in a separate front-only spec that names no backend slices", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        {
          id: "offline-sad", name: "offline error", path: "sad", target: "web",
          terminal: "try again", spec: "e2e/offline.spec.ts", case: "shows retry",
        },
      ]));
      writeFileSync(
        join(dir, "e2e", "offline.spec.ts"),
        'test("shows retry", async ({ page }) => { await page.route("**/api/**", route => route.abort()); await expect(page.getByText("try again")).toBeVisible(); });\n',
      );

      const result = checkE2e(dir);

      expect(result.gaps).toBe(0);
      expect(result.depthGaps).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported manifest fields instead of silently accepting metadata", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([{
        id: "unsupported", name: "unsupported", path: "happy", target: "web", terminal: "/done",
        spec: "e2e/unsupported.spec.ts", arbitraryTier: "ignored",
      }]));
      writeFileSync(join(dir, "e2e", "unsupported.spec.ts"), 'test("done", async ({ page }) => expect(page).toHaveURL("/done"));\n');

      const result = checkE2e(dir);

      expect(result.gaps).toBe(1);
      expect(result.messages.join(" ")).toContain("unsupported field(s): arbitraryTier");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks disabled and seed-pending curated specs instead of reporting bootstrap green", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        { id: "disabled", name: "disabled", path: "happy", target: "web", terminal: "/done", spec: "e2e/disabled.spec.ts" },
        { id: "pending", name: "pending", path: "happy", target: "web", terminal: "/done", spec: "e2e/pending.spec.ts" },
      ]));
      writeFileSync(join(dir, "e2e", "disabled.spec.ts"), 'test.skip("later", async () => expect(page).toHaveURL("/done"));\n');
      writeFileSync(join(dir, "e2e", "pending.spec.ts"), 'requireSeed(); await expect(page).toHaveURL("/done");\n');

      const result = checkE2e(dir);

      expect(result.gaps).toBe(2);
      expect(result.execution.disabled).toBe(1);
      expect(result.execution["seed-pending"]).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports malformed flow entries and directories used as specs without throwing", () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, "playwright.config.ts"), "export default {};\n");
      mkdirSync(join(dir, "e2e"));
      mkdirSync(join(dir, "e2e", "not-a-spec"));
      writeFileSync(join(dir, "e2e", "flows.json"), JSON.stringify([
        null,
        { id: "directory", name: "directory", path: "happy", target: "web", terminal: "/done", spec: "e2e/not-a-spec" },
      ]));

      const result = checkE2e(dir);

      expect(result.gaps).toBe(3);
      expect(result.messages.join(" ")).toContain("must be an object");
      expect(result.messages.join(" ")).toContain("Playwright");
      expect(result.messages.join(" ")).toContain("has no spec");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Playwright release inventory", () => {
  it("parses projected and default-project specs with nested titles", () => {
    const listed = parsePlaywrightList([
      "Listing tests:",
      "  [chromium] › login.spec.ts:7:5 › account › signs in",
      "  marketing.spec.ts:3:1 › public marketing remains navigable",
      "Total: 2 tests in 2 files",
    ].join("\n"));

    expect(listed).toEqual([
      { spec: "login.spec.ts", title: "account › signs in" },
      { spec: "marketing.spec.ts", title: "public marketing remains navigable" },
    ]);
  });

  it("rejects a manifest case omitted by runner configuration", () => {
    const flows = [
      { id: "login-happy", target: "web", spec: "e2e/login.spec.ts", case: "signs in" },
      { id: "logout-happy", target: "web", spec: "e2e/logout.spec.ts", case: "signs out" },
    ];
    const listed = [{ spec: "login.spec.ts", title: "account › signs in" }];

    const messages = checkListedWebFlows(flows, listed);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("logout.spec.ts is absent");
  });
});
