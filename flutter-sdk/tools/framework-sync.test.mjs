import assert from "node:assert/strict";
import test from "node:test";
import { checkFrameworkSync } from "./framework-sync.mjs";

test("framework sync holds npm tooling and pub runtime to one release table", () => {
  const canonical = [
    { name: "skies-flutter", version: "1.2.3", ecosystem: "npm" },
    { name: "skies_flutter", version: "1.2.0", ecosystem: "pub" },
  ];
  assert.equal(checkFrameworkSync({
    packageJson: { devDependencies: { "skies-flutter": "1.2.3" } },
    pubspec: "dependencies:\n  skies_flutter: ^1.2.0\n",
    canonical,
  }).ok, true);
  assert.equal(checkFrameworkSync({ packageJson: {}, pubspec: "", canonical }).ok, false);
});
