import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkFlutterReactParity } from "./parity.mjs";

test("manifest proves the current React-to-Flutter capability inventory", () => {
  const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = checkFlutterReactParity({ sdkRoot, repositoryRoot: resolve(sdkRoot, "..") });
  assert.deepEqual(result.gaps, []);
});
