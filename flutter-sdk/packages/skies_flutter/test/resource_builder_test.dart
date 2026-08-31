import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skies_flutter/skies_flutter.dart';

void main() {
  testWidgets(
    'renders failure through the required surface and exposes retry',
    (tester) async {
      var retried = false;

      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: ResourceBuilder<int>(
            state: AsyncFailure<int>(
              StateError('offline'),
              StackTrace.current,
              retry: () => retried = true,
            ),
            loading: (_) => const Text('loading'),
            empty: (_) => const Text('empty'),
            failure: (_, _, retry) => GestureDetector(
              onTap: retry == null ? null : () => retry(),
              child: const Text('retry'),
            ),
            ready: (_, value) => Text('$value'),
          ),
        ),
      );

      await tester.tap(find.text('retry'));

      expect(retried, isTrue);
    },
  );
}
