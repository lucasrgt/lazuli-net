import assert from "node:assert/strict";
import test from "node:test";

import { pascal, renderFeature, snake } from "./generate.mjs";

test("derives idiomatic Dart names", () => {
  assert.equal(snake("UserWallets"), "user_wallets");
  assert.equal(pascal("user-wallets"), "UserWallets");
});

test("renders the four mirrored members of a Flutter MVVM unit", () => {
  const files = renderFeature({
    name: "wallets",
    itemType: "ListWalletsWalletView",
    itemImport: "package:sample_api/sample_api.dart",
    appPackage: "sample_app",
    zone: "account",
    criteria: ["lists-wallets", "reveals-wallet-failure"],
  });

  assert.deepEqual(Object.keys(files.lib).sort(), ["wallets_view.dart", "wallets_view_model.dart"]);
  assert.deepEqual(Object.keys(files.test).sort(), ["wallets.assay_test.dart", "wallets_view_model_test.dart", "wallets_view_test.dart"]);
  assert.deepEqual(Object.keys(files.l10n).sort(), ["wallets_en.arb", "wallets_es.arb", "wallets_pt_BR.arb"]);
  assert.match(files.lib["wallets_view_model.dart"], /extends ChangeNotifier/);
  assert.match(files.lib["wallets_view_model.dart"], /AsyncState<List<ListWalletsWalletView>>/);
  assert.match(files.lib["wallets_view.dart"], /ResourceBuilder<List<ListWalletsWalletView>>/);
  assert.doesNotMatch(files.lib["wallets_view.dart"], /ListView|Text\(/);
  assert.doesNotMatch(files.lib["wallets_view.dart"], /package:dio/);
  assert.match(files.test["wallets_view_test.dart"], /package:sample_app\/features\/account\/wallets/);
  assert.match(files.test["wallets_view_test.dart"], /meetsGuideline\(textContrastGuideline\)/);
  assert.match(files.test["wallets.assay_test.dart"], /@avp lists-wallets/);
  assert.match(files.test["wallets.assay_test.dart"], /tags: 'avp'/);
});
