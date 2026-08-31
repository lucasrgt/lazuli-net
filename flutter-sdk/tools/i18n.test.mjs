import assert from "node:assert/strict";
import test from "node:test";
import { assembleArb, checkArbParity, checkErrorCodeCoverage, contractErrorCodes } from "./i18n.mjs";

const catalogs = [
  { path: "wallets_pt_BR.arb", value: { title: "Carteiras", apiError_missing: "Ausente" } },
  { path: "wallets_en.arb", value: { title: "Wallets", apiError_missing: "Missing" } },
];

test("ARB parity and assembly preserve every feature key", () => {
  assert.equal(checkArbParity(catalogs, ["pt_BR", "en"]).ok, true);
  assert.deepEqual(assembleArb(catalogs).get("en"), catalogs[1].value);
});

test("error-code coverage derives the OpenAPI enum", () => {
  const codes = contractErrorCodes({ components: { schemas: { ErrorBody: { properties: { code: { enum: ["missing"] } } } } } });
  assert.equal(checkErrorCodeCoverage(catalogs[0].value, codes).ok, true);
  assert.deepEqual(checkErrorCodeCoverage({}, codes).uncovered, ["missing"]);
});
