import { describe, it, expect } from "vitest";
// @ts-expect-error - plain .mjs tool module, typed by its JSDoc
import {
  extractHooks,
  extractGeneratedImports,
  extractBackendSliceLinks,
  extractGeneratedExports,
  findOffDoorOperations,
  checkEndpointCoverage,
  endpointCoverageExitCode,
  isDataDoor,
} from "./endpoint-coverage.mjs";

// SKYFE008 — every app-facing generated hook should be consumed by a ViewModel; an unconsumed one is a warn-tier
// "loose endpoint" (backend done, UI not wired). Pin extraction + the wired/loose split on the pure core.
describe("extractHooks", () => {
  it("pulls use<Name> hooks from generated-client source (function or const exports)", () => {
    const client = `
      export function useGetThing() {}
      export const useListThings = () => {};
      export function notAHook() {}
      export const helper = 1;
    `;
    expect(extractHooks(client).sort()).toEqual(["useGetThing", "useListThings"]);
  });
});

describe("checkEndpointCoverage", () => {
  it("is fully covered when every hook is referenced by a ViewModel", () => {
    const r = checkEndpointCoverage(
      ["useA", "useB"],
      `import { useA, useB } from "@/client.gen/app"; const a = useA(); const b = useB();`,
    );
    expect(r.total).toBe(2);
    expect(r.wired).toBe(2);
    expect(r.loose).toEqual([]);
    expect(r.messages).toEqual([]);
  });

  it("counts wiring across several frontend surfaces as one product coverage set", () => {
    const consumerApp = `import { useMe } from "@/client.gen/app"; const account = useMe();`;
    const operatorApp = `import { useListMunicipalities } from "@/client.gen/app"; const queue = useListMunicipalities();`;
    const partnerApp = `import { useListMunicipalityVisits } from "@/client.gen/app"; const visits = useListMunicipalityVisits();`;
    const r = checkEndpointCoverage(
      ["useMe", "useListMunicipalities", "useListMunicipalityVisits"],
      [consumerApp, operatorApp, partnerApp].join("\n"),
    );

    expect(r.wired).toBe(3);
    expect(r.loose).toEqual([]);
  });

  it("flags a loose endpoint (a hook no ViewModel references) as a warning", () => {
    const r = checkEndpointCoverage(["useA", "useB"], `import { useA } from "@/client.gen/app"; const a = useA();`);
    expect(r.wired).toBe(1);
    expect(r.loose).toEqual(["useB"]);
    expect(r.messages.join(" ")).toContain("useB");
    expect(r.messages.join(" ")).toContain("loose endpoint");
  });

  it("dedupes repeated hook names and matches on word boundaries (no substring false-positive)", () => {
    // "useFoo" must not be considered wired just because "useFooBar" appears.
    const r = checkEndpointCoverage(
      ["useFoo", "useFoo", "useFooBar"],
      `import { useFooBar } from "@/client.gen/app"; const x = useFooBar();`,
    );
    expect(r.total).toBe(2); // deduped
    expect(r.loose).toEqual(["useFoo"]);
  });

  it("counts a generated imperative operation without confusing an unrelated local command", () => {
    const direct = checkEndpointCoverage(
      ["useGetDataExportFile"],
      `import { getDataExportFile } from "@hostpoint/app-core/client.gen/hostpoint"; getDataExportFile(id);`,
    );
    expect(direct.loose).toEqual([]);

    const localOnly = checkEndpointCoverage(
      ["useChangePassword"],
      `const changePassword = () => updateCredentials();`,
    );
    expect(localOnly.loose).toEqual(["useChangePassword"]);
  });

  it("counts an explicit raw infrastructure slice link that the feature E2E gate validates", () => {
    const r = checkEndpointCoverage(
      ["useRefresh"],
      `/** @backendSlice Refresh POST /account/refresh */`,
    );

    expect(r.loose).toEqual([]);
  });
});

describe("extractBackendSliceLinks", () => {
  it("extracts only complete slice, method, and absolute-path declarations", () => {
    const links = extractBackendSliceLinks(`
      /** @backendSlice Refresh POST /account/refresh */
      /** @backendSlice ExportReport GET /reports/\${id} */
      /** @backendSlice Incomplete */
    `);

    expect([...links].sort()).toEqual(["ExportReport", "Refresh"]);
  });
});

describe("endpointCoverageExitCode", () => {
  it("keeps loose endpoints advisory while a feature is being built", () => {
    const result = checkEndpointCoverage(["useA"], "");
    expect(endpointCoverageExitCode(result, [], false)).toBe(0);
  });

  it("blocks a release gate with a loose app endpoint", () => {
    const result = checkEndpointCoverage(["useA"], "");
    expect(endpointCoverageExitCode(result, [], true)).toBe(1);
  });

  it("blocks off-door access in every mode", () => {
    const result = checkEndpointCoverage([], "");
    const offDoor = [{ filePath: "src/lib/api.ts", operations: ["useA"] }];
    expect(endpointCoverageExitCode(result, offDoor, false)).toBe(1);
  });
});

describe("extractGeneratedImports", () => {
  it("keeps value imports, their original alias identity, and excludes type-only symbols", () => {
    const source = `
      import { useMe, getFile as download, type MeOutput } from "@/client.gen/app";
      import type { ErrorBody } from "@/client.gen/model";
      import { localThing } from "@/lib/local";
    `;
    expect([...extractGeneratedImports(source)].sort()).toEqual(["getFile", "useMe"]);
  });
});

describe("extractGeneratedExports", () => {
  it("detects value re-exports without treating type re-exports as data access", () => {
    const source = `
      export { useMe, getFile as download, type MeOutput } from "@/client.gen/app";
      export type { ErrorBody } from "@/client.gen/model";
    `;
    expect([...extractGeneratedExports(source)].sort()).toEqual(["getFile", "useMe"]);
  });
});

describe("findOffDoorOperations", () => {
  it("fails generated operations hidden in helpers while leaving generated contract values free", () => {
    const result = findOffDoorOperations(
      ["useRequestUpload", "useMe"],
      [
        {
          filePath: "src/lib/upload.ts",
          source: `import { useRequestUpload } from "@/client.gen/app";`,
        },
        {
          filePath: "src/lib/labels.ts",
          source: `import { Status } from "@/client.gen/model";`,
        },
        {
          filePath: "src/features/Profile.viewModel.ts",
          source: `import { useMe } from "@/client.gen/app";`,
        },
      ],
    );

    expect(result).toEqual([{ filePath: "src/lib/upload.ts", operations: ["useRequestUpload"] }]);
  });

  it("detects an imperative operation laundered through a re-export", () => {
    const result = findOffDoorOperations(["useGetFile"], [
      {
        filePath: "src/lib/api.ts",
        source: `export { getFile as download } from "@/client.gen/app";`,
      },
    ]);

    expect(result).toEqual([{ filePath: "src/lib/api.ts", operations: ["getFile"] }]);
  });

  it("allows the session and guard infrastructure seams", () => {
    const result = findOffDoorOperations(["useMe", "useRefresh"], [
      { filePath: "src/lib/session.ts", source: `import { useRefresh } from "@/client.gen/app";` },
      { filePath: "src/lib/guards/auth.ts", source: `import { useMe } from "@/client.gen/app";` },
    ]);

    expect(result).toEqual([]);
  });
});

describe("isDataDoor", () => {
  it("counts the ViewModels and the SKYFE002 infra seams (lib/session*, lib/guards*) as wiring", () => {
    expect(isDataDoor("src/features/foo/Foo.viewModel.ts")).toBe(true);
    expect(isDataDoor("src/lib/session.ts")).toBe(true);
    expect(isDataDoor("src/lib/session/useSession.ts")).toBe(true);
    expect(isDataDoor("src/lib/guards/RouteGuard.tsx")).toBe(true);
    // Windows separators normalize before matching.
    expect(isDataDoor("src\\lib\\session.ts")).toBe(true);
  });

  it("does not count a View, a lib helper, or a test", () => {
    expect(isDataDoor("src/features/foo/Foo.view.tsx")).toBe(false);
    expect(isDataDoor("src/lib/skies-client.ts")).toBe(false);
    expect(isDataDoor("src/features/foo/Foo.test.tsx")).toBe(false);
  });
});
