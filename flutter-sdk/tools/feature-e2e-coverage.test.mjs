import assert from "node:assert/strict";
import test from "node:test";
import { checkFeatureE2e } from "./feature-e2e-coverage.mjs";

const model = {
  feature: "Wallets",
  path: "wallets_view_model.dart",
  source: "/// @verify lists-wallets\n/// @verify reveals-failure\n/// @e2e wallets-happy\n/// @e2e wallets-sad\napi.listWallets();",
};
const flows = [
  { id: "wallets-happy", features: ["Wallets"], path: "happy", criteria: [{ id: "lists-wallets", evidence: "wallet-row" }], backendSlices: ["ListWallets"] },
  { id: "wallets-sad", features: ["Wallets"], path: "sad", criteria: [{ id: "reveals-failure", evidence: "wallet-error" }], backendSlices: ["ListWallets"] },
];

test("feature E2E coverage closes criteria, reciprocal flows, and operation proofs", () => {
  assert.equal(checkFeatureE2e([model], flows, ["ListWallets"]).ok, true);
  assert.equal(checkFeatureE2e([model], flows.slice(0, 1), ["ListWallets"]).ok, false);
});
