import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skies_flutter/skies_flutter.dart';

void main() {
  test(
    'api error copy resolves a stable code and falls back for transport errors',
    () {
      final request = RequestOptions(path: '/');
      final localizations = _Localizations({
        'apiErrors.wallet_missing': 'Wallet not found',
        'common.state.loadError': 'Try again',
      });
      final coded = SkiesApiException<Object>(
        statusCode: 404,
        body: {'code': 'wallet_missing'},
        cause: DioException(requestOptions: request),
      );
      expect(
        apiErrorCopy(coded, localizations, readCode: _readCode),
        'Wallet not found',
      );
      expect(
        apiErrorCopy(StateError('offline'), localizations, readCode: _readCode),
        'Try again',
      );
    },
  );

  test(
    'mutation boundary invalidates success and always surfaces failure',
    () async {
      final feedback = _Feedback();
      var invalidations = 0;
      final boundary = MutationBoundary(
        invalidateQueries: () => invalidations++,
        feedback: feedback,
      );
      expect(await boundary.run(() async => 4, successMessage: 'Saved'), 4);
      expect(invalidations, 1);
      expect(feedback.successes, ['Saved']);

      await expectLater(
        boundary.run<int>(
          () async => throw StateError('down'),
          successMessage: 'Saved',
        ),
        throwsStateError,
      );
      expect(feedback.errors, hasLength(1));

      await expectLater(
        boundary.run<int>(
          () async => throw StateError('invalid credentials'),
          successMessage: 'Saved',
          expectedFailure: true,
        ),
        throwsStateError,
      );
      expect(feedback.errors, hasLength(1));
    },
  );
}

String? _readCode(Object body) =>
    (body as Map<String, Object?>)['code'] as String?;

final class _Localizations implements SkiesLocalizations {
  _Localizations(this.values);

  final Map<String, String> values;

  @override
  bool exists(String key) => values.containsKey(key);

  @override
  String text(String key) => values[key]!;
}

final class _Feedback implements FeedbackSink {
  final successes = <String>[];
  final errors = <Object>[];

  @override
  void error(Object error) => errors.add(error);

  @override
  void success(String message) => successes.add(message);
}
