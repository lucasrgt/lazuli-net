import assert from "node:assert/strict";
import test from "node:test";

import { generatorArguments, projectAppClient } from "./generate-client.mjs";

test("projects only application operations without mutating the source contract", () => {
  const contract = {
    openapi: "3.1.1",
    paths: {
      "/wallets": { get: { operationId: "ListWallets", tags: ["Wallets"] } },
      "/asset": {
        get: {
          operationId: "Asset",
          tags: ["skies:asset"],
          responses: { 200: { content: { "application/json": { schema: { $ref: "#/components/schemas/Asset" } } } } },
        },
      },
      "/webhook": { post: { operationId: "Webhook", "x-skies-endpoint-kind": "webhook" } },
      "/internal": { get: { operationId: "Internal", "x-skies-app-client-excluded": true } },
    },
    components: {
      schemas: {
        Asset: { type: "object" },
      },
    },
  };

  const projected = projectAppClient(contract);

  assert.deepEqual(Object.keys(projected.paths), ["/wallets"]);
  assert.equal(projected.components, undefined);
  assert.equal(Object.keys(contract.paths).length, 4);
  assert.ok(contract.components.schemas.Asset);
});

test("pins dart-dio, built_value and generated-package metadata", () => {
  const args = generatorArguments({
    input: "contract.json",
    output: "client.gen",
    name: "sample_api",
    version: "1.2.3",
  });

  assert.deepEqual(args.slice(0, 5), ["generate", "-g", "dart-dio", "-i", "contract.json"]);
  assert.ok(args.includes("pubName=sample_api,pubVersion=1.2.3,pubPublishTo=none,serializationLibrary=built_value"));
  assert.ok(args.includes("apiDocs=false,modelDocs=false,apiTests=false,modelTests=false"));
});

test("rejects a package name that could inject generator properties", () => {
  assert.throws(
    () => generatorArguments({ input: "x", output: "y", name: "sample,hide=true" }),
    /lowercase Dart package identifier/,
  );
});
