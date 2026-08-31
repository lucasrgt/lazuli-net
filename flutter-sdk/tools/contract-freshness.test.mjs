import assert from "node:assert/strict";
import test from "node:test";
import { checkFreshness, stampOf } from "./contract-freshness.mjs";

test("contract stamp ignores formatting and rejects semantic drift", () => {
  const compact = '{"openapi":"3.1.0","paths":{}}';
  const formatted = '{\n  "openapi": "3.1.0",\n  "paths": {}\n}';
  assert.equal(stampOf(compact), stampOf(formatted));
  assert.equal(checkFreshness({ specText: compact, stamp: stampOf(formatted) }).status, "ok");
  assert.equal(checkFreshness({ specText: compact, stamp: "old" }).status, "stale");
});
