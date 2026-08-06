import manifest from "./package.json" with { type: "json" };
import { errorCodeRegistry } from "./rules/error-code-registry.js";
import { explicitSliceContract } from "./rules/explicit-slice-contract.js";
import { fileSize } from "./rules/file-size.js";
import { noRepository } from "./rules/no-repository.js";
import { requireSliceTest } from "./rules/require-slice-test.js";
import { sliceShape } from "./rules/slice-shape.js";
import { testsUnderSource } from "./rules/tests-under-source.js";
import { thinMap } from "./rules/thin-map.js";

const { version } = manifest;

export const ruleIds = Object.freeze({
  "slice-shape": "SKYN0001",
  "thin-map": "SKYN0002",
  "require-slice-test": "SKYN0003",
  "no-repository": "SKYN0006",
  "file-size": "SKYN0007",
  "tests-under-source": "SKYN0011",
  "error-code-registry": "SKYN0018",
  "explicit-slice-contract": "SKYN0022",
});

const rules = {
  "slice-shape": sliceShape,
  "thin-map": thinMap,
  "require-slice-test": requireSliceTest,
  "no-repository": noRepository,
  "file-size": fileSize,
  "tests-under-source": testsUnderSource,
  "error-code-registry": errorCodeRegistry,
  "explicit-slice-contract": explicitSliceContract,
};

const plugin = {
  meta: { name: "eslint-plugin-skies-node", version },
  ruleIds,
  rules,
  configs: {},
};

const recommended = Object.keys(rules).filter((rule) => rule !== "require-slice-test");
plugin.configs["flat/recommended"] = {
  name: "skies-node/recommended",
  plugins: { "skies-node": plugin },
  rules: Object.fromEntries(recommended.map((rule) => [`skies-node/${rule}`, "error"])),
};

export default plugin;
