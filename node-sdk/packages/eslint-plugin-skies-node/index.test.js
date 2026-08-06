import assert from "node:assert/strict";
import plugin, { ruleIds } from "./index.js";
import manifest from "./package.json" with { type: "json" };
import "./tests/core-rules.test.js";
import "./tests/error-code-registry.test.js";
import "./tests/explicit-slice-contract.test.js";
import "./tests/no-repository.test.js";
import "./tests/path-and-size.test.js";

assert.equal(plugin.meta.version, manifest.version);
assert.equal(plugin.ruleIds, ruleIds);
assert.deepEqual(ruleIds, {
  "slice-shape": "SKYN0001",
  "thin-map": "SKYN0002",
  "require-slice-test": "SKYN0003",
  "no-repository": "SKYN0006",
  "file-size": "SKYN0007",
  "tests-under-source": "SKYN0011",
  "error-code-registry": "SKYN0018",
  "explicit-slice-contract": "SKYN0022",
});

const configured = plugin.configs["flat/recommended"].rules;
for (const [name, id] of Object.entries(ruleIds)) {
  const messages = Object.values(plugin.rules[name].meta.messages);
  assert.ok(messages.length > 0, `${name} must publish messages`);
  assert.ok(messages.every((message) => message.startsWith(`${id}:`)), `${name} messages must carry ${id}`);
  assert.equal(configured[`skies-node/${name}`], name === "require-slice-test" ? undefined : "error");
}
