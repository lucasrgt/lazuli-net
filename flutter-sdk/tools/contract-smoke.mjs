#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateClient } from "./generate-client.mjs";

const tools = resolve(fileURLToPath(new URL(".", import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), "skies-flutter-contract-"));
const output = join(temporary, "fixture_api");

try {
  await generateClient({
    input: join(tools, "fixtures", "skies.openapi.json"),
    output,
    name: "skies_fixture_api",
    version: "0.1.0",
  });

  const api = readFileSync(join(output, "lib", "src", "api", "wallets_api.dart"), "utf8");
  const wallet = readFileSync(join(output, "lib", "src", "model", "wallet_view.dart"), "utf8");
  const error = readFileSync(join(output, "lib", "src", "model", "error_body.dart"), "utf8");

  assert.match(api, /Future<Response<ListWalletsOutput>> listWallets/);
  assert.doesNotMatch(api, /InternalHealth/);
  assert.equal(existsSync(join(output, "lib", "src", "model", "internal_health_output.dart")), false);
  assert.match(wallet, /double\? get lastDeposit/);
  assert.match(error, /class ErrorBodyCodeEnum extends EnumClass/);
  assert.ok(existsSync(join(output, ".skies-generated-client")));
  assert.match(readFileSync(join(output, ".spec-hash"), "utf8"), /^[0-9a-f]{64}\n$/);
  console.log("skies flutter contract smoke: PASS");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
