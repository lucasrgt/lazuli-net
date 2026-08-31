import 'package:flutter_test/flutter_test.dart';
import 'package:skies_flutter/skies_flutter.dart';

void main() {
  test('toAsyncState projects loading, empty, failure, and ready', () {
    expect(
      toAsyncState<int>(isLoading: true, data: null),
      isA<AsyncLoading<int>>(),
    );
    expect(
      toAsyncState<List<int>>(
        isLoading: false,
        data: const [],
        isEmpty: (items) => items.isEmpty,
      ),
      isA<AsyncEmpty<List<int>>>(),
    );
    expect(
      toAsyncState<int>(isLoading: false, data: null, error: StateError('x')),
      isA<AsyncFailure<int>>(),
    );
    expect(
      toAsyncState<int>(isLoading: false, data: 7),
      isA<AsyncReady<int>>(),
    );
  });

  test('map projects only ready data', () {
    expect(
      const AsyncReady<int>(3).map((value) => '$value!'),
      isA<AsyncReady<String>>().having((state) => state.data, 'data', '3!'),
    );
    expect(
      const AsyncEmpty<int>().map((value) => '$value'),
      isA<AsyncEmpty<String>>(),
    );
  });

  test(
    'combined states use failure, loading, empty, ready precedence',
    () async {
      var retries = 0;
      final failed = combineAsyncStates2<int, String>(
        AsyncFailure<int>(
          StateError('down'),
          StackTrace.empty,
          retry: () => retries++,
        ),
        const AsyncLoading<String>(),
      );
      expect(failed, isA<AsyncFailure<(int, String)>>());
      await (failed as AsyncFailure<(int, String)>).retry?.call();
      expect(retries, 1);

      expect(
        combineAsyncStates2<int, String>(
          const AsyncLoading<int>(),
          const AsyncEmpty<String>(),
        ),
        isA<AsyncLoading<(int, String)>>(),
      );
      expect(
        combineAsyncStates2<int, String>(
          const AsyncReady<int>(1),
          const AsyncEmpty<String>(),
        ),
        isA<AsyncEmpty<(int, String)>>(),
      );
      final ready =
          combineAsyncStates3<int, String, bool>(
                const AsyncReady<int>(1),
                const AsyncReady<String>('two'),
                const AsyncReady<bool>(true),
              )
              as AsyncReady<(int, String, bool)>;
      expect(ready.data, (1, 'two', true));
    },
  );
}
