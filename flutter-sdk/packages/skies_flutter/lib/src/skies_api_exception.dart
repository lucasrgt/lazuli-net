import 'package:dio/dio.dart';

/// Decodes the generated canonical error model from a Dio response body.
typedef SkiesErrorDecoder<E> = E Function(Object? data);

/// A typed failed Skies request, retaining both its canonical body and transport cause.
final class SkiesApiException<E> implements Exception {
  /// Creates a typed API failure.
  const SkiesApiException({
    required this.statusCode,
    required this.body,
    required this.cause,
  });

  /// The HTTP status, or null when no response reached the device.
  final int? statusCode;

  /// The generated `ErrorBody`, or null for an undecodable or transport failure.
  final E? body;

  /// The original Dio failure, preserved for transport diagnostics.
  final DioException cause;

  @override
  String toString() =>
      'SkiesApiException(statusCode: $statusCode, body: $body, cause: ${cause.type})';
}

/// Executes one generated `dart-dio` operation and exposes its body or a typed Skies failure.
Future<T> executeSkiesRequest<T, E>(
  Future<Response<T>> Function() request, {
  required SkiesErrorDecoder<E> decodeError,
}) async {
  try {
    final response = await request();
    final data = response.data;
    if (data == null) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
        error: StateError('A successful Skies response had no body.'),
      );
    }
    return data;
  } on DioException catch (cause) {
    E? body;
    final responseData = cause.response?.data;
    if (responseData != null) {
      try {
        body = decodeError(responseData);
      } on Object {
        body = null;
      }
    }
    throw SkiesApiException<E>(
      statusCode: cause.response?.statusCode,
      body: body,
      cause: cause,
    );
  }
}
