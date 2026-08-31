import assert from "node:assert/strict";
import test from "node:test";

import { renderDesignKit } from "./design-scaffold.mjs";

test("renders the closed Flutter token vocabulary and app-owned kit", () => {
  const files = renderDesignKit();
  assert.equal(Object.keys(files).length, 11);
  assert.match(files["design/tokens.dart"], /enum SpaceToken/);
  assert.match(files["design/tokens.dart"], /enum ColorRole/);
  assert.match(files["design/tokens.dart"], /const shadow = <ShadowToken, List<BoxShadow>>/);
  assert.match(files["ui/app_stack.dart"], /StackAlign/);
  assert.match(files["ui/app_stack.dart"], /this\.padding = SpaceToken\.none/);
  assert.match(files["ui/app_button.dart"], /minHeight: 44/);
  assert.match(files["ui/app_button.dart"], /loading \|\| disabled/);
  assert.match(files["ui/app_button.dart"], /ColorRole\.onDanger/);
  assert.match(files["ui/app_field.dart"], /live: true/);
  assert.match(files["ui/app_field.dart"], /MergeSemantics/);
  assert.match(files["ui/app_input.dart"], /validator: validator/);
  assert.doesNotMatch(files["ui/app_screen.dart"], /package:skies_flutter/);
});
