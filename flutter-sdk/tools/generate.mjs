/** Convert a feature token into a Dart file stem. */
export function snake(value) {
  return String(value)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

/** Convert a feature token into a Dart type stem. */
export function pascal(value) {
  return snake(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

/** Render a co-located, server-backed Flutter feature unit. */
export function renderFeature({ name, itemType, itemImport, appPackage, zone = "", criteria = [] }) {
  const stem = snake(name);
  const Feature = pascal(name);
  if (!stem || !/^[A-Z][A-Za-z0-9]*$/.test(itemType)) throw new TypeError("invalid feature or item type");
  if (typeof itemImport !== "string" || /['\r\n]/.test(itemImport)) throw new TypeError("invalid item import");
  if (!/^[a-z][a-z0-9_]*$/.test(appPackage)) throw new TypeError("invalid application package name");
  if (!Array.isArray(criteria) || criteria.length < 2 || new Set(criteria).size !== criteria.length || criteria.some((id) => !/^[a-z0-9][a-z0-9._-]*$/.test(id))) {
    throw new TypeError("at least two distinct verification criteria are required");
  }
  const zoneStem = zone ? snake(zone) : "";
  if (zone && !zoneStem) throw new TypeError("invalid feature zone");
  const packageFeaturePath = ["features", zoneStem, stem].filter(Boolean).join("/");

  const viewModel = `import 'package:flutter/foundation.dart';
import 'package:skies_flutter/skies_flutter.dart';
import '${itemImport}';

/// The typed composition-root port that wires this feature to its generated operation.
typedef Load${Feature} = Future<List<${itemType}>> Function();

/// Owns the complete UI state and commands for [${Feature}View].
${criteria.map((id) => `/// @verify ${id}`).join("\n")}
/// @e2e ${stem}-happy
/// @e2e ${stem}-sad
final class ${Feature}ViewModel extends ChangeNotifier {
  ${Feature}ViewModel({required this.load${Feature}});

  /// The generated-client wiring supplied by the composition root.
  final Load${Feature} load${Feature};
  AsyncState<List<${itemType}>> _state = const AsyncLoading<List<${itemType}>>();

  /// The closed resource state consumed by the View.
  AsyncState<List<${itemType}>> get state => _state;

  /// Loads or retries this feature through its typed generated-client wiring.
  Future<void> load() async {
    _state = const AsyncLoading<List<${itemType}>>();
    notifyListeners();
    try {
      final items = List<${itemType}>.unmodifiable(await load${Feature}());
      _state = items.isEmpty
          ? const AsyncEmpty<List<${itemType}>>()
          : AsyncReady<List<${itemType}>>(items);
    } on Object catch (error, stackTrace) {
      _state = AsyncFailure<List<${itemType}>>(error, stackTrace);
    }
    notifyListeners();
  }
}
`;

  const view = `import 'package:flutter/widgets.dart';
import 'package:skies_flutter/skies_flutter.dart';
import '${itemImport}';

import '${stem}_view_model.dart';

/// The render-only View for one [${Feature}ViewModel].
final class ${Feature}View extends StatefulWidget {
  const ${Feature}View({
    required this.viewModel,
    required this.ready,
    required this.loading,
    required this.empty,
    required this.failure,
    super.key,
  });

  final ${Feature}ViewModel viewModel;
  final Widget Function(BuildContext context, List<${itemType}> items) ready;
  final WidgetBuilder loading;
  final WidgetBuilder empty;
  final Widget Function(BuildContext context, Object error, AsyncRetry? retry) failure;

  @override
  State<${Feature}View> createState() => _${Feature}ViewState();
}

final class _${Feature}ViewState extends State<${Feature}View> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => widget.viewModel.load());
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: widget.viewModel,
        builder: (context, _) => ResourceBuilder<List<${itemType}>>(
          state: widget.viewModel.state,
          loading: widget.loading,
          empty: widget.empty,
          failure: widget.failure,
          retry: widget.viewModel.load,
          ready: widget.ready,
        ),
      );
}
`;

  const viewModelTest = `import 'package:flutter_test/flutter_test.dart';
import 'package:skies_flutter/skies_flutter.dart';
import '${itemImport}';
import 'package:${appPackage}/${packageFeaturePath}/${stem}_view_model.dart';

void main() {
  test('an empty authoritative response becomes the explicit empty state', () async {
    final viewModel = ${Feature}ViewModel(
      load${Feature}: () async => <${itemType}>[],
    );

    await viewModel.load();

    expect(viewModel.state, isA<AsyncEmpty<List<${itemType}>>>());
  });

  test('a failed request becomes the explicit failure state', () async {
    final viewModel = ${Feature}ViewModel(
      load${Feature}: () async => throw StateError('unavailable'),
    );

    await viewModel.load();

    expect(viewModel.state, isA<AsyncFailure<List<${itemType}>>>());
  });
}
`;

  const viewTest = `import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import '${itemImport}';
import 'package:${appPackage}/${packageFeaturePath}/${stem}_view.dart';
import 'package:${appPackage}/${packageFeaturePath}/${stem}_view_model.dart';

void main() {
  testWidgets('renders the explicit empty surface after loading', (tester) async {
    final viewModel = ${Feature}ViewModel(
      load${Feature}: () async => <${itemType}>[],
    );

    await tester.pumpWidget(Directionality(
      textDirection: TextDirection.ltr,
      child: ${Feature}View(
        viewModel: viewModel,
        ready: (_, items) => Text(items.join(',')),
        loading: (_) => const Text('loading'),
        empty: (_) => const Text('empty'),
        failure: (_, error, retry) => const Text('failure'),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('empty'), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });
}
`;

  const assayTest = `import 'package:flutter_test/flutter_test.dart';

void main() {
${criteria.map((id) => `  // @avp ${id}\n  test('${id}', () {\n    fail('Replace this deliberate red proof with an observable assertion for ${id}.');\n  }, tags: 'avp');`).join("\n\n")}
}
`;

  const copies = {
    pt_BR: {
      [`${stem}Title`]: Feature,
      [`${stem}EmptyTitle`]: "Nenhum item encontrado",
      [`${stem}LoadError`]: "Não foi possível carregar. Tente novamente.",
    },
    es: {
      [`${stem}Title`]: Feature,
      [`${stem}EmptyTitle`]: "No se encontraron elementos",
      [`${stem}LoadError`]: "No se pudo cargar. Inténtalo de nuevo.",
    },
    en: {
      [`${stem}Title`]: Feature,
      [`${stem}EmptyTitle`]: "No items found",
      [`${stem}LoadError`]: "Could not load. Try again.",
    },
  };

  return {
    lib: {
      [`${stem}_view_model.dart`]: viewModel,
      [`${stem}_view.dart`]: view,
    },
    test: {
      [`${stem}_view_model_test.dart`]: viewModelTest,
      [`${stem}_view_test.dart`]: viewTest,
      [`${stem}.assay_test.dart`]: assayTest,
    },
    l10n: Object.fromEntries(Object.entries(copies).map(([locale, catalog]) => [
      `${stem}_${locale}.arb`,
      `${JSON.stringify(catalog, null, 2)}\n`,
    ])),
  };
}
