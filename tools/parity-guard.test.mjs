import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  matchesGlob, expandGlob, validateManifest, validateInventory,
  checkDrift, explainPath, walkFiles, bootstrapChangedPaths, discoverChangedPaths
} from "./parity-guard.mjs";

const fileNames = [
  "d/src/api.cs", "d/tests/api.test.cs", "n/src/api.js", "n/tests/api.test.js",
  "common/wire.json", "d/consumer.cs", "n/consumer.js"
];

function manifest() {
  return {
    $schema: "./skies.parity.schema.json",
    schemaVersion: 1,
    policy: {
      behaviorPatterns: { dotnet: ["d/**/*.cs"], node: ["n/**/*.js"] },
      ignoredBehavior: []
    },
    sharedContracts: [{
      id: "wire", path: "common/wire.json",
      consumers: { dotnet: ["d/consumer.cs"], node: ["n/consumer.js"] }
    }],
    capabilities: [{
      id: "api", statement: "The API behaves alike", parity: "equivalent",
      dotnet: { scopes: ["d/src/**/*.cs", "d/consumer.cs"], proofs: [{ kind: "test", path: "d/tests/**/*.cs" }] },
      node: { scopes: ["n/src/**/*.js", "n/consumer.js"], proofs: [{ kind: "test", path: "n/tests/**/*.js" }] },
      sharedContracts: ["wire"]
    }],
    diagnostics: [{ dotnet: "SKY0001", node: { kind: "diagnostic", value: "SKYN0001" }, capability: "api" }],
    deferments: []
  };
}

async function fixture(t, names = fileNames) {
  const root = await mkdtemp(join(tmpdir(), "parity-guard-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of names) {
    await mkdir(join(root, name, "..").replace(/[\\/]\.\.$/, ""), { recursive: true });
    await writeFile(join(root, name), "fixture\n");
  }
  return root;
}

test("glob matching supports star and globstar", () => {
  assert.equal(matchesGlob("d/api.cs", "d/**/*.cs"), true);
  assert.equal(matchesGlob("d/a/b/api.cs", "d/**/*.cs"), true);
  assert.equal(matchesGlob("d/a/b/api.js", "d/**/*.cs"), false);
  assert.deepEqual(expandGlob("n/*/*.js", ["n/src/a.js", "n/a/b/c.js"]), ["n/src/a.js"]);
});

test("valid closed manifest passes", () => {
  assert.deepEqual(validateManifest(manifest(), fileNames), []);
});

test("missing and unknown keys are rejected", () => {
  const missing = manifest();
  delete missing.policy.ignoredBehavior;
  assert.match(validateManifest(missing, fileNames).join("\n"), /missing ignoredBehavior/);
  const unknown = manifest();
  unknown.capabilities[0].surprise = true;
  assert.match(validateManifest(unknown, fileNames).join("\n"), /unknown key surprise/);
});

test("all tracked or untracked behavior must be inventoried", () => {
  const errors = validateInventory(manifest(), [...fileNames, "d/not-owned.cs"]);
  assert.deepEqual(errors, ["unmapped dotnet behavior: d/not-owned.cs"]);
  const ignored = manifest();
  ignored.policy.ignoredBehavior.push("d/not-owned.cs");
  assert.deepEqual(validateInventory(ignored, [...fileNames, "d/not-owned.cs"]), []);
});

test("unilateral changes fail and paired changes pass", () => {
  assert.match(checkDrift(manifest(), ["d/src/api.cs"]).join("\n"), /missing node/);
  assert.deepEqual(checkDrift(manifest(), ["d/src/api.cs", "n/src/api.js"]), []);
  assert.match(checkDrift(manifest(), ["d/unowned.cs"]).join("\n"), /unmapped/);
});

test("proof edits are mapped but only scope edits participate in pairing", () => {
  assert.deepEqual(checkDrift(manifest(), ["d/tests/api.test.cs"]), []);
  assert.match(
    checkDrift(manifest(), ["d/src/api.cs", "n/tests/api.test.js"]).join("\n"),
    /missing node/
  );
});

test("active deferments permit the missing side and expired ones do not", () => {
  const active = manifest();
  active.deferments.push({
    id: "api-node", capability: "api", side: "node", reason: "follow-up",
    owner: "sdk", expires: "2099-01-01"
  });
  assert.deepEqual(checkDrift(active, ["d/src/api.cs"], "2025-01-01"), []);
  active.deferments[0].expires = "2024-12-31";
  assert.match(checkDrift(active, ["d/src/api.cs"], "2025-01-01").join("\n"), /unilateral/);
});

test("diagnostics are closed, unique, sorted, and capability-linked", () => {
  const bad = manifest();
  bad.diagnostics.push({ dotnet: "SKY0001", node: { kind: "diagnostic", value: "oops" }, capability: "missing" });
  const errors = validateManifest(bad, fileNames).join("\n");
  assert.match(errors, /dotnet IDs must be unique/);
  assert.match(errors, /SKYN diagnostic ID/);
  assert.match(errors, /unknown capability missing/);
  const alternate = manifest();
  alternate.diagnostics[0].node = { kind: "language", value: "TypeScript structural typing" };
  assert.deepEqual(validateManifest(alternate, fileNames), []);
});

test("shared contracts need both real consumers and a capability reference", () => {
  const noNode = manifest();
  noNode.sharedContracts[0].consumers.node = [];
  assert.match(validateManifest(noNode, fileNames).join("\n"), /consumers.node must not be empty/);
  const unreferenced = manifest();
  unreferenced.capabilities[0].sharedContracts = [];
  assert.match(validateManifest(unreferenced, fileNames).join("\n"), /not referenced/);
  const missingConsumer = manifest();
  missingConsumer.sharedContracts[0].consumers.node = ["n/missing.js"];
  assert.match(validateManifest(missingConsumer, fileNames).join("\n"), /does not match a real file/);
});

test("explain reports behavior ownership", () => {
  const info = explainPath(manifest(), "d/src/api.cs");
  assert.deepEqual(info.behaviorSides, ["dotnet"]);
  assert.equal(info.ignored, false);
  assert.deepEqual(info.mappings.map(({ capability, side }) => [capability, side]), [["api", "dotnet"]]);
});

test("a base without a parity manifest bootstraps without runtime drift", () => {
  assert.deepEqual(
    bootstrapChangedPaths(["d/src/api.cs", "n/src/api.js"], false),
    ["parity/skies.parity.json"]
  );
  assert.deepEqual(bootstrapChangedPaths(["n/src/api.js", "d/src/api.cs"], true), ["d/src/api.cs", "n/src/api.js"]);
});

test("a base that predates the manifest anchors at its introduction instead of bootstrapping", async t => {
  const root = await fixture(t, ["n/src/api.js", "d/src/api.cs"]);
  await writeFile(join(root, "n/src/api.js"), "before\n");
  await writeFile(join(root, "d/src/api.cs"), "before\n");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.test"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "base"]);
  const base = git(root, ["rev-parse", "HEAD"]);
  await mkdir(join(root, "parity"), { recursive: true });
  await writeFile(join(root, "parity/skies.parity.json"), JSON.stringify(manifest()));
  await writeFile(join(root, "n/src/api.js"), "after\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "add manifest and node change"]);
  const changed = discoverChangedPaths(root, { base });
  assert.deepEqual(changed, ["n/src/api.js", "parity/skies.parity.json"]);
  // The anchored change set is validated: the node-only edit is real unilateral drift, not bootstrapped away.
  assert.match(checkDrift(manifest(), changed).join("\n"), /missing dotnet change/);
});

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

test("walkFiles returns repository-relative paths", async t => {
  const root = await fixture(t);
  assert.deepEqual(await walkFiles(root), [...fileNames].sort());
});
