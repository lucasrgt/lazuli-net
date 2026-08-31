import assert from "node:assert/strict";
import test from "node:test";
import { checkEndpointCoverage, operationIds } from "./endpoint-coverage.mjs";

test("coverage derives projected operations and accepts only Flutter data doors", () => {
  const document = { openapi: "3.1.0", paths: {
    "/wallets": { get: { operationId: "ListWallets", responses: {} } },
    "/hook": { post: { operationId: "Hook", tags: ["skies:webhook"], responses: {} } },
  } };
  const ids = operationIds(document);
  assert.deepEqual(ids, ["ListWallets"]);
  const covered = checkEndpointCoverage(ids, [{ path: "lib/features/wallets/wallets_view_model.dart", text: "api.listWallets();" }]);
  assert.equal(covered.ok, true);
  const offDoor = checkEndpointCoverage(ids, [{ path: "lib/features/wallets/wallets_view.dart", text: "api.listWallets();" }]);
  assert.equal(offDoor.offDoor.length, 1);
});
