import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skies_flutter/skies_flutter.dart';

void main() {
  test(
    'returns the typed body from a successful generated operation',
    () async {
      final options = RequestOptions(path: '/wallets');

      final value = await executeSkiesRequest<String, Map<String, Object?>>(
        () async => Response(data: 'ready', requestOptions: options),
        decodeError: _decodeMap,
      );

      expect(value, 'ready');
    },
  );

  test(
    'maps a canonical error while preserving status and Dio cause',
    () async {
      final options = RequestOptions(path: '/wallets');
      final cause = DioException(
        requestOptions: options,
        response: Response(
          requestOptions: options,
          statusCode: 422,
          data: <String, Object?>{'code': 'wallets.invalid'},
        ),
        type: DioExceptionType.badResponse,
      );

      await expectLater(
        () => executeSkiesRequest<String, Map<String, Object?>>(
          () async => throw cause,
          decodeError: _decodeMap,
        ),
        throwsA(
          isA<SkiesApiException<Map<String, Object?>>>()
              .having((error) => error.statusCode, 'statusCode', 422)
              .having((error) => error.body?['code'], 'code', 'wallets.invalid')
              .having((error) => error.cause, 'cause', same(cause)),
        ),
      );
    },
  );

  test(
    'keeps an undecodable transport response as a typed failure with null body',
    () async {
      final options = RequestOptions(path: '/wallets');

      await expectLater(
        () => executeSkiesRequest<String, Map<String, Object?>>(
          () async => throw DioException(
            requestOptions: options,
            response: Response(
              requestOptions: options,
              statusCode: 502,
              data: '<html>',
            ),
          ),
          decodeError: _decodeMap,
        ),
        throwsA(
          isA<SkiesApiException<Map<String, Object?>>>()
              .having((error) => error.statusCode, 'statusCode', 502)
              .having((error) => error.body, 'body', isNull),
        ),
      );
    },
  );
}

Map<String, Object?> _decodeMap(Object? data) =>
    Map<String, Object?>.from(data! as Map<Object?, Object?>);
