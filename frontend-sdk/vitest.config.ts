import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";

// Verifies the framework's spine/tools AND the canonical example (examples/sample-app) — wired, not mocked. The
// example's agnostic core (the ViewModel + the design-system-driven View) renders against the WEB `@/ui` impl in
// jsdom; the spine + the generated client + i18n resolve to source. Root is the repo so the example (a sibling of
// frontend/) is in scope; the include globs keep the run to the real test files.
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  server: { fs: { allow: [r("..")] } }, // allow loading the example (a sibling of frontend/) under the repo root
  test: {
    root: r(".."),
    environment: "jsdom",
    setupFiles: [r("./vitest.setup.ts")],
    // __fixtures__ holds textual ESLint RuleTester fixtures (including SKYFE033's fake Assay calls),
    // not runnable suites — keep them out of the run (+ Vitest's own defaults).
    exclude: [...configDefaults.exclude, "**/__fixtures__/**"],
    include: [
      "frontend-sdk/packages/**/*.test.{ts,tsx}",
      "frontend-sdk/tools/**/*.test.{ts,tsx}",
      "examples/sample-app/frontend/core/**/*.test.{ts,tsx}",
      "examples/sample-app/frontend/web/**/*.test.{ts,tsx}",
    ],
  },
  resolve: {
    alias: {
      "skies-react": r("./packages/skies-react/src/index.ts"),
      "avp-assay/react/vitest": r("./node_modules/avp-assay/dist/react/vitest.js"),
      "avp-assay/react": r("./node_modules/avp-assay/dist/react.js"),
      "avp-assay": r("./node_modules/avp-assay/dist/index.js"),
      "@/client.gen/sample": r("../examples/sample-app/frontend/core/src/client.gen/sample.ts"),
      "@/i18n": r("../examples/sample-app/frontend/core/src/i18n.ts"),
      "@/design/tokens": r("../examples/sample-app/frontend/core/src/design/tokens.ts"),
      "@/ui": r("../examples/sample-app/frontend/web/src/ui/index.ts"),
      // The example lives at examples/ (a sibling of frontend/), so its direct bare imports can't reach
      // frontend/node_modules by node resolution — alias them to the framework's installed copies (their transitive
      // deps then resolve from there naturally). Boundary-matched, so "react" doesn't catch "react-i18next" etc.
      react: r("./node_modules/react"),
      "react-i18next": r("./node_modules/react-i18next"),
      i18next: r("./node_modules/i18next"),
      "@testing-library/react": r("./node_modules/@testing-library/react"),
      "@tanstack/react-query": r("./node_modules/@tanstack/react-query"),
      "react-hook-form": r("./node_modules/react-hook-form"),
      zod: r("./node_modules/zod"),
      "@hookform/resolvers": r("./node_modules/@hookform/resolvers"),
    },
  },
});
