import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { renderFeature, renderResources, pascal, singular } from "./generate.mjs";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require("../packages/eslint-plugin/index.cjs");

// The scaffolded unit must be conformant BY CONSTRUCTION — there is no point generating a feature the harness then
// rejects. So we render one, write it to disk (so test-colocated can see the sibling test), and lint every file
// with the real SKYFE rules: zero messages is the contract. This is the generator's analogue of the plugin's own
// self-test — proving the emitter and the enforcer agree.
const lintConfig = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module" as const,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { skies: plugin },
    rules: {
      "skies/view-purity": "error",
      "skies/data-door": "error",
      "skies/viewmodel-platform-agnostic": "error",
      "skies/test-colocated": "error",
      "skies/view-integration-test": "error",
      "skies/no-mock": "error",
      "skies/state-completeness": "error",
      "skies/i18n-completeness": "error",
      "skies/design-tokens": "error",
      // The design band (SKYFE024–026): the emitted View composes @/ui only — no host elements, no
      // free-form styling, no raw color. The emitter and the enforcer agree here too.
      "skies/ui-door": "error",
      "skies/scale-only": "error",
      "skies/semantic-colors": "error",
      "skies/verify-has-avp-proof": "error",
      "skies/feature-has-e2e-flow": "error",
    },
  },
];

describe("renderFeature", () => {
  it("derives the names from a plural feature name", () => {
    expect(pascal("user-profiles")).toBe("UserProfiles");
    expect(singular("bookings")).toBe("booking");
    expect(singular("categories")).toBe("category");
  });

  it("emits the five co-located files of the unit", () => {
    const files = renderFeature("bookings", ["lists-authoritative-bookings", "reveals-list-failure"]);
    expect(Object.keys(files).sort()).toEqual(
      ["Bookings.assay.test.tsx", "Bookings.test.tsx", "Bookings.view.tsx", "Bookings.viewModel.ts", "bookings.i18n.ts"].sort(),
    );
  });

  it("wires the spine: AsyncState door, <Resource> view, renderHook test, 3 locales", () => {
    const files = renderFeature("bookings", ["lists-authoritative-bookings", "reveals-list-failure"]);
    const vm = files["Bookings.viewModel.ts"];
    expect(vm).toContain("AsyncState<Booking[]>");
    expect(vm).toContain("useListBookings");
    expect(vm).toContain('i18n.t("bookings:error")');
    expect(files["Bookings.view.tsx"]).toContain("<Resource");
    expect(files["Bookings.test.tsx"]).toContain("renderHook");
    expect(vm).toContain("@verify lists-authoritative-bookings");
    expect(vm).toContain("@verify reveals-list-failure");
    expect(vm).toContain("@e2e bookings-happy");
    expect(vm).toContain("@e2e bookings-sad");
    expect(files["Bookings.test.tsx"]).not.toContain("@avp");
    expect(files["Bookings.assay.test.tsx"]).toContain("@avp lists-authoritative-bookings");
    expect(files["Bookings.assay.test.tsx"]).toContain("@avp reveals-list-failure");
    expect(files["Bookings.assay.test.tsx"]).toContain("defineVerification(...productVerification(");
    const i18n = files["bookings.i18n.ts"];
    for (const locale of ["ptBR", "esES", "enUS"]) expect(i18n).toContain(`export const ${locale}`);
  });

  it("emits a unit that passes every SKYFE rule (conformant by construction)", () => {
    // Write under the repo (cwd) so the flat-config `files` globs match and test-colocated resolves the sibling.
    const dir = mkdtempSync(join(process.cwd(), "tools", ".scaffold-tmp-"));
    try {
      const files = renderFeature("bookings", ["lists-authoritative-bookings", "reveals-list-failure"]);
      for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);

      const linter = new Linter();
      for (const name of Object.keys(files)) {
        const path = join(dir, name);
        const filename = relative(process.cwd(), path);
        const messages = linter.verify(readFileSync(path, "utf8"), lintConfig, { filename });
        expect(messages, `${name}: ${JSON.stringify(messages)}`).toEqual([]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("renderResources", () => {
  it("composes the locale -> namespace tree from the discovered catalogs", () => {
    const out = renderResources([
      { ns: "items", importPath: "../features/items/items.i18n" },
      { ns: "bookings", importPath: "../features/bookings/bookings.i18n" },
    ]);
    expect(out).toContain('import { ptBR as items_ptBR, esES as items_esES, enUS as items_enUS } from "../features/items/items.i18n";');
    expect(out).toContain('"bookings": bookings_enUS,');
    expect(out).toContain("export const resources");
    // sorted deterministically (bookings before items) so the generated file is stable across runs.
    expect(out.indexOf("bookings_ptBR")).toBeLessThan(out.indexOf("items_ptBR"));
  });

  it("makes a JS-safe identifier from a kebab namespace", () => {
    const out = renderResources([{ ns: "user-profile", importPath: "./up.i18n" }]);
    expect(out).toContain("user_profile_enUS");
    expect(out).toContain('"user-profile": user_profile_enUS,');
  });
});
