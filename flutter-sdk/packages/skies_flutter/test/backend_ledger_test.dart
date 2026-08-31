import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skies_flutter/skies_flutter_testing.dart';

void main() {
  test('ledger maps real Dio responses to operationId and outcome', () {
    final ledger = BackendLedgerInterceptor([
      BackendOperation(
        operationId: 'GetWallet',
        method: 'GET',
        pathTemplate: '/wallets/{id}',
      ),
    ]);
    final request = RequestOptions(
      path: '/wallets/42',
      method: 'GET',
      baseUrl: 'https://example.test',
    );
    final handler = _ResponseHandler();
    ledger.onResponse(
      Response<Object?>(requestOptions: request, statusCode: 200),
      handler,
    );

    ledger.expectSlices(['GetWallet'], outcome: BackendOutcome.success);
    expect(
      () => ledger.expectSlices(['GetWallet'], outcome: BackendOutcome.error),
      throwsStateError,
    );
  });
}

final class _ResponseHandler extends ResponseInterceptorHandler {}
