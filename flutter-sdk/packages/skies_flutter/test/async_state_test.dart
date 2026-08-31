import 'package:flutter_test/flutter_test.dart';
import 'package:skies_flutter/skies_flutter.dart';

void main() {
  test('when projects the ready member without nullable probing', () {
    const state = AsyncReady<int>(42);

    final result = state.when(
      loading: () => 'loading',
      empty: () => 'empty',
      failure: (_, _, _) => 'failure',
      ready: (value) => 'ready:$value',
    );

    expect(result, 'ready:42');
  });

  test('failure preserves the diagnostic stack', () {
    final stack = StackTrace.current;
    final state = AsyncFailure<int>(StateError('offline'), stack);

    expect(state.stackTrace, same(stack));
  });
}
