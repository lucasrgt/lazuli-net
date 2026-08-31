import assert from "node:assert/strict";
import test from "node:test";
import { checkJourneyParity, extractBackendJourneyInventory } from "./journey-parity.mjs";

test("UI-bound Flutter writes require backend happy and sad journeys", () => {
  const source = `[Slice]\npublic static class Deposit { public static void Map() => app.MapPost("/", Handle); }\n[Journey(typeof(Deposit), JourneyPath.Happy)]`;
  const inventory = extractBackendJourneyInventory([source]);
  const result = checkJourneyParity(inventory, [{ backendSlices: ["Deposit"] }]);
  assert.deepEqual(result.missing, [{ slice: "Deposit", paths: ["sad"] }]);
});
