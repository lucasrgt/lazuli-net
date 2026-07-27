import { describe, expect, it } from "vitest";
import { apiErrorCode, apiErrorCopy, type I18nLike } from "./api-error";

// The bridge turns a failed request into the copy a user reads — code from the wire, copy from the catalog,
// a generic fallback when the code is unknown, null when there is nothing to show.
describe("api-error", () => {
  const failed = (code?: string) => ({ response: { data: code ? { code } : {} } });
  const catalog = (entries: Record<string, string>): I18nLike => ({
    exists: (key) => key in entries,
    t: (key) => entries[key] ?? key,
  });

  it("reads the ErrorBody code off the axios error", () => {
    expect(apiErrorCode(failed("wallets.insufficient_funds"))).toBe("wallets.insufficient_funds");
  });

  it("a codeless failure (network, crash) carries no code", () => {
    expect(apiErrorCode(failed())).toBeNull();
    expect(apiErrorCode(new Error("ECONNREFUSED"))).toBeNull();
  });

  it("a known code resolves to its catalog copy", () => {
    const i18n = catalog({ "api-errors:wallets.insufficient_funds": "Saldo insuficiente." });
    expect(apiErrorCopy(failed("wallets.insufficient_funds"), i18n)).toBe("Saldo insuficiente.");
  });

  it("an unknown code falls back to the generic copy instead of leaking the key", () => {
    const i18n = catalog({ "common:state.loadError": "Algo deu errado." });
    expect(apiErrorCopy(failed("wallets.brand_new_code"), i18n)).toBe("Algo deu errado.");
  });

  it("no error means no copy — the ViewModel can map the mutation's error slot directly", () => {
    expect(apiErrorCopy(null, catalog({}))).toBeNull();
    expect(apiErrorCopy(undefined, catalog({}))).toBeNull();
  });

  it("namespace and fallback are catalog conventions an app can override", () => {
    const i18n = catalog({ "errors:x.y": "custom", "oops:generic": "generic" });
    expect(apiErrorCopy(failed("x.y"), i18n, { namespace: "errors" })).toBe("custom");
    expect(apiErrorCopy(failed("unknown"), i18n, { fallbackKey: "oops:generic" })).toBe("generic");
  });
});
