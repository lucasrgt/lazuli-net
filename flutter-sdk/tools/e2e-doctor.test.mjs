import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkE2e } from "./e2e-doctor.mjs";

test("Flutter integration flow requires terminal, criterion, and real backend evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "skies-flutter-e2e-"));
  try {
    mkdirSync(join(root, "integration_test"));
    mkdirSync(join(root, "contract"));
    writeFileSync(join(root, "contract", "api.json"), "{}");
    writeFileSync(join(root, "integration_test", "wallets_test.dart"), "IntegrationTestWidgetsFlutterBinding.ensureInitialized();\ntestWidgets('wallets', (tester) async { BackendLedgerInterceptor([]); expect(find.byKey(Key('wallets-ready')), findsOneWidget); expect(find.byKey(Key('wallet-row')), findsOneWidget); ledger.expectSlices(['ListWallets'], outcome: BackendOutcome.success); });\n");
    const flows = [{
      id: "wallets-happy", name: "lists wallets", features: ["Wallets"], target: "native", path: "happy",
      spec: "integration_test/wallets_test.dart", terminal: "wallets-ready", criteria: [{ id: "lists-wallets", evidence: "wallet-row" }],
      backendSlices: ["ListWallets"], backendContract: "contract/api.json",
    }];
    assert.equal(checkE2e(root, flows, { scripts: { "test:e2e": "flutter test integration_test" } }).ok, true);
    assert.equal(checkE2e(root, [{ ...flows[0], terminal: "missing" }], { scripts: {} }).ok, false);
    assert.equal(checkE2e(root, [{ ...flows[0], path: "sad" }], { scripts: { "test:e2e": "flutter test integration_test" } }).ok, false);
    writeFileSync(join(root, "integration_test", "wallets_test.dart"), "IntegrationTestWidgetsFlutterBinding.ensureInitialized();\ntestWidgets('wallets', (tester) async { BackendLedgerInterceptor([]); const mentionedOnly = 'wallets-ready wallet-row'; ledger.expectSlices(['ListWallets'], outcome: BackendOutcome.success); });\n");
    const unproved = checkE2e(root, flows, { scripts: { "test:e2e": "flutter test integration_test" } });
    assert.ok(unproved.gaps.some((gap) => gap.includes("does not assert terminal")));
    assert.ok(unproved.gaps.some((gap) => gap.includes("lacks distinct visible evidence")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
