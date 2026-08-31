import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { diagnose } from "./doctor.mjs";

const CASES = [
  ["SKYFL001", "lib/features/x/x_view.dart", "import 'package:dio/dio.dart';"],
  ["SKYFL002", "lib/helper.dart", "void f() => client.api.getWalletApi().listWallets();"],
  ["SKYFL003", "lib/helper.dart", "import 'package:mocktail/mocktail.dart';"],
  ["SKYFL004", "lib/features/x/x_view_model.dart", "Widget build(BuildContext context) => value;"],
  ["SKYFL005", "lib/features/x/x_view.dart", "class XView {}"],
  ["SKYFL006", "lib/features/x/x_view.dart", "class XView {}"],
  ["SKYFL007", "lib/features/x/x_view_model.dart", "final class XViewModel extends ChangeNotifier {}"],
  ["SKYFL009", "lib/features/x/x_view_model.dart", "import 'package:camera/camera.dart';\nAsyncState<int> state;"],
  ["SKYFL010", "lib/features/x/x_view.dart", "class XView {}"],
  ["SKYFL012", "lib/helper.dart", "const color = '#abcdef';"],
  ["SKYFL013", "lib/features/x/x_view_model.dart", "AsyncState<int> state; Future<void> save() async { await write(); }"],
  ["SKYFL014", "lib/features/x/x_view.dart", "Text('Hardcoded');"],
  ["SKYFL015", "lib/features/x/x_view.dart", "addPostFrameCallback((_) { context.go('/home'); });"],
  ["SKYFL016", "lib/features/x/helper.dart", "void f() => setAccessToken('x');"],
  ["SKYFL017", "lib/routes/account_guard.dart", "if (!isAuthenticated) redirect();"],
  ["SKYFL018", "lib/routes/detail_route.dart", "final id = state.pathParameters['id'];"],
  ["SKYFL019", "lib/helper.dart", "void f() => context.pop();"],
  ["SKYFL020", "lib/client.dart", "final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8080'));"],
  ["SKYFL021", "lib/features/x/helper.dart", "Widget build() => Html(data: body);"],
  ["SKYFL022", "lib/routes/login_route.dart", "void f() => context.go(returnTo);"],
  ["SKYFL023", "lib/helper.dart", "// TODO wire later"],
  ["SKYFL024", "lib/features/x/x_view.dart", "Text(localizations.title);"],
  ["SKYFL025", "lib/helper.dart", "final padding = EdgeInsets.all(13);"],
  ["SKYFL026", "lib/helper.dart", "const color = Color(0xff123456);"],
  ["SKYFL027", "lib/features/x/x_view_model.dart", "AsyncState<int> state; Future<void> save() async { try { await write(); } catch (error) { state = AsyncFailure(error, StackTrace.current); } }"],
  ["SKYFL028", "lib/helper.dart", "final onSuccess = () { refetch(); };"],
  ["SKYFL029", "lib/features/x/helper.dart", "Future<void> f() => refreshSession();"],
  ["SKYFL030", "lib/routes/detail_route.dart", "void f() => context.go(route as dynamic);"],
  ["SKYFL031", "lib/features/x/x_view_model.dart", "AsyncState<int> state; void submit() { form.validate(); }"],
  ["SKYFL032", "lib/ui/app_input.dart", "Widget build() => TextFormField();"],
  ["SKYFL033", "lib/features/x/x_view_model.dart", "AsyncState<int> state; /// @e2e x-happy\n/// @e2e x-sad"],
  ["SKYFL034", "test/helper_test.dart", "test('disabled', () {}, skip: true);"],
  ["SKYFL035", "lib/features/x/x_view_model.dart", "AsyncState<int> state; /// @verify works"],
];

for (const [code, path, source] of CASES) {
  test(`${code} fires on its Flutter violation`, () => {
    const root = mkdtempSync(join(tmpdir(), "skyfl-rule-"));
    try {
      write(root, path, source);
      mkdirSync(join(root, "lib"), { recursive: true });
      if (code === "SKYFL010") write(root, "lib/features/x/x_view_model.dart", "AsyncState<int> state; /// @verify works\n/// @e2e x-happy\n/// @e2e x-sad");
      const rules = diagnose(root).map((finding) => finding.rule);
      assert.ok(rules.includes(code), `${code} was absent; got ${rules.join(", ")}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("SKYFL008 fires only as a warning until strict release", () => {
  const root = mkdtempSync(join(tmpdir(), "skyfl-rule-"));
  try {
    mkdirSync(join(root, "lib"));
    assert.equal(diagnose(root, { operationIds: ["ListWallets"] })[0].rule, "SKYFL008");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SKYFL011 compares Flutter ARB locale keys", () => {
  const root = mkdtempSync(join(tmpdir(), "skyfl-rule-"));
  try {
    write(root, "lib/l10n/x_en.arb", '{"title":"Title","empty":"Empty"}');
    write(root, "lib/l10n/x_pt_BR.arb", '{"title":"Título"}');
    assert.ok(diagnose(root).some((finding) => finding.rule === "SKYFL011"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(root, path, source) {
  const output = join(root, path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${source}\n`);
}
