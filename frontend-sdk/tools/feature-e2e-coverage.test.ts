import { describe, expect, it } from "vitest";
import {
  checkFeatureE2e,
  directBackendCalls,
  extractBackendSliceObligations,
  extractE2eObligations,
  extractSlices,
  extractVerificationCriteria,
  isIgnoredSourceDirectory,
  sliceHooks,
} from "./feature-e2e-coverage.mjs";

describe("feature E2E coverage", () => {
  it("excludes the standardized Storybook development surface without allowing arbitrary source bypasses", () => {
    expect(isIgnoredSourceDirectory("storybook")).toBe(true);
    expect(isIgnoredSourceDirectory("stories")).toBe(false);
    expect(isIgnoredSourceDirectory("features")).toBe(false);
  });

  it("extracts stable unique obligations", () => {
    expect(extractE2eObligations("/** @e2e login-happy\n * @e2e login-happy\n * @e2e login-sad */"))
      .toEqual(["login-happy", "login-sad"]);
  });

  it("extracts stable unique AVP/Assay criteria", () => {
    expect(extractVerificationCriteria("/** @verify saves-order\n * @verify saves-order\n * @verify rejects-empty */"))
      .toEqual(["saves-order", "rejects-empty"]);
  });

  it("requires subject flows to cover the complete AVP/Assay criterion set", () => {
    const source = [
      "/** @e2e login-happy",
      " * @e2e login-sad",
      " * @verify authenticates-valid-credentials",
      " * @verify rejects-invalid-credentials */",
    ].join("\n");
    const missing = checkFeatureE2e([{ path: "src/Login.viewModel.ts", source }], [
      {
        id: "login-happy", path: "happy", features: ["Login"],
        criteria: [{ id: "authenticates-valid-credentials", evidence: "/home" }],
      },
      { id: "login-sad", path: "sad", features: ["Login"], criteria: [] },
    ], []);
    expect(missing.coveredCriteria).toBe(1);
    expect(missing.criteria).toBe(2);
    expect(missing.gaps).toBe(2);
    expect(missing.messages.join(" ")).toContain("declares no criteria");
    expect(missing.messages.join(" ")).toContain("rejects-invalid-credentials");

    const complete = checkFeatureE2e([{ path: "src/Login.viewModel.ts", source }], [
      {
        id: "login-happy", path: "happy", features: ["Login"],
        criteria: [{ id: "authenticates-valid-credentials", evidence: "/home" }],
      },
      {
        id: "login-sad", path: "sad", features: ["Login"],
        criteria: [{ id: "rejects-invalid-credentials", evidence: "invalid" }],
      },
    ], []);
    expect(complete.coveredCriteria).toBe(2);
    expect(complete.gaps).toBe(0);
  });

  it("does not let happy and sad cases borrow the same semantic criterion", () => {
    const source = [
      "/** @e2e checkout-happy",
      " * @e2e checkout-sad",
      " * @verify checkout-works */",
    ].join("\n");

    const result = checkFeatureE2e([{ path: "src/Checkout.viewModel.ts", source }], [
      {
        id: "checkout-happy", path: "happy", features: ["Checkout"],
        criteria: [{ id: "checkout-works", evidence: "complete" }],
      },
      {
        id: "checkout-sad", path: "sad", features: ["Checkout"],
        criteria: [{ id: "checkout-works", evidence: "rejected" }],
      },
    ], []);

    expect(result.gaps).toBe(1);
    expect(result.messages.join(" ")).toContain("one executable E2E proof case");
  });

  it("does not let a feature-owned flow sit outside the ViewModel verification inventory", () => {
    const source = [
      "/** @e2e checkout-happy",
      " * @e2e checkout-sad",
      " * @verify completes-checkout",
      " * @verify rejects-declined-payment */",
    ].join("\n");

    const result = checkFeatureE2e([{ path: "src/Checkout.viewModel.ts", source }], [
      {
        id: "checkout-happy", path: "happy", features: ["Checkout"],
        criteria: [{ id: "completes-checkout", evidence: "receipt" }],
      },
      {
        id: "checkout-sad", path: "sad", features: ["Checkout"],
        criteria: [{ id: "rejects-declined-payment", evidence: "declined" }],
      },
      {
        id: "checkout-refund-happy", path: "happy", features: ["Checkout"],
        criteria: [{ id: "refunds-approved-charge", evidence: "refunded" }],
      },
    ], []);

    expect(result.gaps).toBe(2);
    expect(result.messages.join(" ")).toContain("must be declared with @e2e checkout-refund-happy");
    expect(result.messages.join(" ")).toContain("undeclared criterion \"refunds-approved-charge\"");
  });

  it("discovers slices from their structural marker", () => {
    expect(extractSlices([
      "[Slice]\npublic static class Login {}",
      "[Slice]\npublic static class Ping {}",
    ])).toEqual(["Login", "Ping"]);
  });

  it("discovers slices whose attribute lines carry explanatory comments", () => {
    const sources = [
      "[Slice] // visible endpoint\npublic static class Login {}",
      "[Slice] // read-only query\npublic static class Profile {}",
    ];

    expect(extractSlices(sources)).toEqual(["Login", "Profile"]);
  });

  it("discovers compact slices whose marker and class share a line", () => {
    expect(extractSlices([
      "[Slice] public static class GetProfile {}",
      "namespace Sample; [Slice] public static class ListProfiles {}",
      "[Authorize]\n[Slice] public static class SaveProfile {}",
      "[Slice]\npublic static partial class SaveVisualKit {}",
    ])).toEqual(["GetProfile", "ListProfiles", "SaveProfile", "SaveVisualKit"]);
  });

  it("discovers every explicitly named operation owned by a slice mapping", () => {
    const sources = [
      [
        "[Slice]",
        "public static class ExportReport {",
        '  public static void Map() => app.MapGet("/pdf", Handle).WithName("ExportReportPdf");',
        '  public static void MapCsv() => app.MapGet("/csv", Handle).WithName("ExportReportCsv");',
        "}",
      ].join("\n"),
      'public static class Health { public static void Map() => app.MapGet("/", Ping).WithName("Health"); }',
    ];

    expect(extractSlices(sources)).toEqual(["ExportReport", "ExportReportCsv", "ExportReportPdf"]);
  });

  it("finds only generated slice hooks consumed by the ViewModel", () => {
    expect(sliceHooks('import { useLogin, usePing } from "@/client.gen/api";\nuseLogin();', ["Login", "Pay"]))
      .toEqual(["Login"]);
    expect(sliceHooks('import { login as signIn } from "@/client.gen/api";\nsignIn();', ["Login"]))
      .toEqual(["Login"]);
    expect(sliceHooks("// useLogin is prose, not a generated import", ["Login"]))
      .toEqual([]);
    expect(sliceHooks([
      'import { useLogin } from "@/lib/local-login";',
      'import { usePing } from "@/client.gen/api";',
    ].join("\n"), ["Login", "Pay"]))
      .toEqual([]);
  });

  it("discovers literal raw infrastructure calls and their explicit slice identity", () => {
    const source = [
      "/** @backendSlice Refresh POST /account/refresh */",
      'client.post<{ accessToken: string }>("/account/refresh", {});',
    ].join("\n");

    expect(directBackendCalls(source)).toEqual([{ method: "POST", path: "/account/refresh" }]);
    expect(extractBackendSliceObligations(source)).toEqual([{
      slice: "Refresh", method: "POST", path: "/account/refresh",
    }]);
  });

  it("requires every ViewModel to link an existing flow", () => {
    const result = checkFeatureE2e([
      { path: "src/Login.viewModel.ts", source: "/** @e2e login-happy\n * @e2e login-sad */" },
      { path: "src/Profile.viewModel.ts", source: "export function useProfile() {}" },
      { path: "src/Unknown.viewModel.ts", source: "/** @e2e missing */" },
    ], [
      { id: "login-happy", path: "happy", features: ["Login"] },
      { id: "login-sad", path: "sad", features: ["Login"] },
    ], []);

    expect(result.features).toBe(3);
    expect(result.linked).toBe(1);
    expect(result.gaps).toBe(2);
    expect(result.messages.join("\n")).toContain("declares no");
    expect(result.messages.join("\n")).toContain("resolves to no surface");
  });

  it("requires subject-bound happy and sad frontend flows for every ViewModel", () => {
    const viewModels = [{
      path: "src/Login.viewModel.ts",
      source: '/** @e2e login-happy */\nimport { useLogin } from "@/client.gen/api";',
    }];
    const incomplete = checkFeatureE2e(viewModels, [
      { id: "login-happy", path: "happy", features: ["Login"], backendSlices: ["Login"] },
    ], ["Login"]);
    expect(incomplete.complete).toBe(0);
    expect(incomplete.gaps).toBe(1);
    expect(incomplete.messages.join(" ")).toContain("path:sad");

    const complete = checkFeatureE2e([{
      ...viewModels[0],
      source: "/** @e2e login-happy\n * @e2e login-sad */\nuseLogin();",
    }], [
      { id: "login-happy", path: "happy", features: ["Login"], backendSlices: ["Login"] },
      { id: "login-sad", path: "sad", features: ["Login"], backendSlices: ["Login"] },
    ], ["Login"]);
    expect(complete.gaps).toBe(0);
    expect(complete.linked).toBe(1);
  });

  it("rejects a shared flow that lets multiple ViewModels borrow one proof", () => {
    const result = checkFeatureE2e([
      { path: "src/Cart.viewModel.ts", source: "/** @e2e checkout-happy\n * @e2e checkout-sad */" },
      { path: "src/Payment.viewModel.ts", source: "/** @e2e checkout-happy\n * @e2e checkout-sad */" },
    ], [
      { id: "checkout-happy", path: "happy", features: ["Cart", "Payment"] },
      { id: "checkout-sad", path: "sad", features: ["Cart", "Payment"] },
    ], []);
    expect(result.gaps).toBeGreaterThan(0);
    expect(result.messages.join(" ")).toContain("exactly one ViewModel");
  });

  it("rejects duplicate flow ids across surfaces", () => {
    const result = checkFeatureE2e([], [
      { id: "login", path: "happy", __surface: "web" },
      { id: "login", path: "happy", __surface: "mobile" },
    ], []);
    expect(result.gaps).toBe(1);
    expect(result.messages.join(" ")).toContain("duplicated");
  });

  it("requires every UI-consumed slice to be named by its linked flow", () => {
    const viewModel = [{
      path: "src/Profile.viewModel.ts",
      source: '/** @e2e profile-happy\n * @e2e profile-sad */\nimport { useGetProfile } from "@/client.gen/api";',
    }];
    const missing = checkFeatureE2e(viewModel, [
      { id: "profile-happy", path: "happy", features: ["Profile"] },
      { id: "profile-sad", path: "sad", features: ["Profile"] },
    ], ["GetProfile"]);
    expect(missing.gaps).toBe(1);
    expect(missing.messages.join(" ")).toContain("backendSlices");

    const covered = checkFeatureE2e(viewModel, [
      { id: "profile-happy", path: "happy", features: ["Profile"], backendSlices: ["GetProfile"] },
      { id: "profile-sad", path: "sad", features: ["Profile"], backendSlices: ["GetProfile"] },
    ], ["GetProfile"]);
    expect(covered.gaps).toBe(0);
  });

  it("proves a shared endpoint once through one of its real consumer features", () => {
    const viewModels = [
      {
        path: "src/CustomerPicker.viewModel.ts",
        source: '/** @e2e picker-happy\n * @e2e picker-sad */\nimport { useListCustomers } from "@/client.gen/api";',
      },
      {
        path: "src/JobForm.viewModel.ts",
        source: '/** @e2e job-happy\n * @e2e job-sad */\nimport { useListCustomers } from "@/client.gen/api";',
      },
    ];
    const result = checkFeatureE2e(viewModels, [
      { id: "picker-happy", path: "happy", features: ["CustomerPicker"], backendSlices: ["ListCustomers"] },
      { id: "picker-sad", path: "sad", features: ["CustomerPicker"] },
      { id: "job-happy", path: "happy", features: ["JobForm"] },
      { id: "job-sad", path: "sad", features: ["JobForm"] },
    ], ["ListCustomers"]);

    expect(result.gaps).toBe(0);
    expect(result.complete).toBe(2);
  });

  it("does not let an unrelated feature borrow endpoint coverage", () => {
    const viewModels = [
      {
        path: "src/Profile.viewModel.ts",
        source: '/** @e2e profile-happy\n * @e2e profile-sad */\nimport { useGetProfile } from "@/client.gen/api";',
      },
      { path: "src/Login.viewModel.ts", source: "/** @e2e login-happy\n * @e2e login-sad */" },
    ];
    const result = checkFeatureE2e(viewModels, [
      { id: "profile-happy", path: "happy", features: ["Profile"] },
      { id: "profile-sad", path: "sad", features: ["Profile"] },
      { id: "login-happy", path: "happy", features: ["Login"], backendSlices: ["GetProfile"] },
      { id: "login-sad", path: "sad", features: ["Login"] },
    ], ["GetProfile"]);

    expect(result.gaps).toBe(1);
    expect(result.messages.join(" ")).toContain("no subject flow");
  });

  it("requires infrastructure data doors to have flows too", () => {
    const infrastructure = [{
      path: "src/lib/session.ts",
      source: 'import { useRefreshSession } from "@/client.gen/api";\nuseRefreshSession();',
    }];
    const missing = checkFeatureE2e([], [], ["RefreshSession"], infrastructure);
    expect(missing.gaps).toBe(1);
    expect(missing.messages.join(" ")).toContain("UI infrastructure");

    const complete = checkFeatureE2e([], [
      { id: "refresh-happy", path: "happy", backendSlices: ["RefreshSession"] },
      { id: "refresh-sad", path: "sad", backendSlices: ["RefreshSession"] },
    ], ["RefreshSession"], infrastructure);
    expect(complete.gaps).toBe(0);
  });

  it("covers every multi-step infrastructure endpoint without inventing an unreachable sad response per step", () => {
    const infrastructure = [{
      path: "src/lib/upload.ts",
      source: [
        'import { useRequestUpload, useConfirmUpload } from "@/client.gen/api";',
        "useRequestUpload(); useConfirmUpload();",
      ].join("\n"),
    }];
    const result = checkFeatureE2e([], [
      { id: "upload-happy", path: "happy", backendSlices: ["RequestUpload", "ConfirmUpload"] },
      { id: "upload-sad", path: "sad", backendSlices: ["RequestUpload"] },
    ], ["RequestUpload", "ConfirmUpload"], infrastructure);

    expect(result.gaps).toBe(0);
  });

  it("requires raw infrastructure calls to declare and prove their backend slice", () => {
    const missingDeclaration = checkFeatureE2e([], [], ["Refresh"], [{
      path: "src/lib/client.ts",
      source: 'client.post("/account/refresh", {});',
    }]);
    expect(missingDeclaration.gaps).toBe(1);
    expect(missingDeclaration.messages.join(" ")).toContain("@backendSlice");

    const source = [
      "/** @backendSlice Refresh POST /account/refresh */",
      'client.post("/account/refresh", {});',
    ].join("\n");
    const covered = checkFeatureE2e([], [
      { id: "refresh-happy", path: "happy", backendSlices: ["Refresh"] },
      { id: "refresh-sad", path: "sad", backendSlices: ["Refresh"] },
    ], ["Refresh"], [{ path: "src/lib/client.ts", source }]);
    expect(covered.gaps).toBe(0);

    const stale = checkFeatureE2e([], [], ["Refresh"], [{
      path: "src/lib/client.ts",
      source: "/** @backendSlice Refresh POST /account/refresh */",
    }]);
    expect(stale.gaps).toBeGreaterThan(0);
    expect(stale.messages.join(" ")).toContain("no matching raw");
  });
});
