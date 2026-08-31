# Skies Flutter SDK

The idiomatic Flutter body of the Skies frontend contract: runtime primitives with capability parity to
`@skiesjs/react`, pinned `dart-dio` generation, app-owned MVVM/design scaffolding, all 35 `SKYFL` rules, and
fail-closed full-stack evidence.

## Packages

- `packages/skies_flutter` — async state, session, guards, navigation, forms, mutations, API errors, pagination,
  Dio auth, and the test-only real-backend ledger.
- `tools/generate-client.mjs` — projects the app audience and runs stock OpenAPI Generator `dart-dio`.
- `tools/app-scaffold.mjs` — adds the removable npm/gate bridge to an ordinary Flutter app.
- `tools/client-scaffold.mjs` — emits hand-owned client, session, and mutation composition seams.
- `tools/scaffold-feature.mjs` — emits View/ViewModel/unit/widget/AVP/ARB feature units.
- `tools/design-scaffold.mjs` — emits the app-owned closed token vocabulary and UI kit.
- `tools/doctor.mjs` — aggregates `SKYFL001–035`, endpoint, E2E, and optional backend-journey evidence.
- `parity/flutter-react.parity.json` — machine-readable React-to-Flutter capability inventory.

## Initialize an app

Start from Flutter's own project generator, then add the Skies harness and runtime:

```powershell
flutter create my_app
cd my_app
npx --yes --package skies-flutter skies-flutter-app .
npm install
flutter pub add skies_flutter
flutter pub add "dev:integration_test:{sdk: flutter}"
```

The bridge adds package scripts, `l10n.yaml`, and the closed `e2e/flows.json` inventory. Removing `package.json`
removes only enforcement; the Dart application remains ordinary Flutter source.

## Generate the client and hand-owned seams

```powershell
npm install
node tools/generate-client.mjs `
  --input ../contract/App.Api.json `
  --output ../app/packages/app_api `
  --name app_api

node tools/client-scaffold.mjs `
  --package app_api `
  --class AppApi `
  --output-dir ../app/lib
```

The generated package carries `.skies-generated-client` and `.spec-hash`. Regeneration verifies the projected
contract with `build_runner`, formatting, and Dart analysis, then atomically replaces only a marked directory.
The three files under `lib/` are one-shot source owned by the application.

On Windows, `DART_BIN` may point to Flutter's `bin\dart.bat` or the SDK's `dart.exe`; the wrapper resolves the real
executable without a shell.

## Scaffold design and a feature

```powershell
node tools/design-scaffold.mjs ../app

node tools/scaffold-feature.mjs wallets `
  --item-type ListWalletsWalletView `
  --item-import package:app_api/app_api.dart `
  --app-package my_app `
  --project ../app `
  --zone account `
  --verify lists-wallets,reveals-wallet-failure
```

The feature's `*.assay_test.dart` proofs are deliberately red until their chosen criteria have observable product
assertions. Add reciprocal happy/sad flows to `e2e/flows.json` and official Flutter `integration_test` specs.

The composition root supplies the generated operation:

```dart
final viewModel = WalletsViewModel(
  loadWallets: () async {
    final output = await skiesClient.request(
      () => skiesClient.api.getSampleApiApi().listWallets(),
    );
    return output.wallets.items.toList();
  },
);
```

## Gates

```powershell
node tools/doctor.mjs ../app `
  --contract ../contract/App.Api.json `
  --backend-root ../backend/App.Api `
  --strict

node tools/contract-freshness.mjs ../contract/App.Api.json ../app/packages/app_api
node tools/i18n.mjs check ../app/lib/l10n/features
node tools/parity.mjs
npm run check
```

`--strict` promotes construction-time warnings to release errors. The unified doctor also validates real
`integration_test` inventory and full-stack backend journey parity when their inputs are supplied.

See [Flutter conventions](../docs/FLUTTER-CONVENTIONS.md) for every pattern and `SKYFL` rule.
