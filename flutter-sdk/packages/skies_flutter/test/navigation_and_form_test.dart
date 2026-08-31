import 'package:flutter_test/flutter_test.dart';
import 'package:skies_flutter/skies_flutter.dart';

void main() {
  test('requiredParam normalizes scalar, repeated, and absent values', () {
    expect(
      requiredParam('abc'),
      isA<ReadyParam>().having((value) => value.value, 'value', 'abc'),
    );
    expect(
      requiredParam(['first', 'second']),
      isA<ReadyParam>().having((value) => value.value, 'value', 'first'),
    );
    expect(requiredParam(''), isA<MissingParam>());
    expect(requiredParam(null), isA<MissingParam>());
  });

  test('safeBack falls back after a deep link and pops in-app history', () {
    final deepLink = _Router(canPop: false);
    safeBack(deepLink, '/home');
    expect(deepLink.replaced, '/home');

    final inApp = _Router(canPop: true);
    safeBack(inApp, '/home');
    expect(inApp.popped, isTrue);
  });

  test(
    'submitOrReveal surfaces the first invalid field in visual order',
    () async {
      String? revealed;
      var submitted = false;
      final first = await submitOrReveal<String>(
        validate: () => false,
        invalidFields: () => ['description', 'name'],
        order: ['name', 'description'],
        onValid: () => submitted = true,
        onInvalid: (field) => revealed = field,
      );
      expect(first, 'name');
      expect(revealed, 'name');
      expect(submitted, isFalse);
    },
  );
}

final class _Router implements BackRouter<String> {
  _Router({required this.canPop});

  final bool canPop;
  bool popped = false;
  String? replaced;

  @override
  void back() => popped = true;

  @override
  bool canGoBack() => canPop;

  @override
  void replace(String destination) => replaced = destination;
}
