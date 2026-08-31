import 'dart:async';

import 'package:dio/dio.dart';

import 'single_flight.dart';

/// Resolves the current short-lived access token from app-owned storage.
typedef AccessTokenProvider = FutureOr<String?> Function();

/// Refreshes the current session and reports whether a replay may proceed.
typedef SessionRefresher = Future<bool> Function();

/// Identifies authentication routes that must never recursively trigger refresh.
typedef AuthRoutePredicate = bool Function(RequestOptions request);

/// Injects bearer access and performs one single-flight refresh replay after a 401.
final class SkiesAuthInterceptor extends Interceptor {
  /// Creates the auth seam around an app-owned token provider and optional refresher.
  SkiesAuthInterceptor({
    required Dio dio,
    required AccessTokenProvider accessToken,
    SessionRefresher? refreshSession,
    AuthRoutePredicate? isAuthRoute,
  }) : _dio = dio,
       _accessToken = accessToken,
       _refreshGate = refreshSession == null
           ? null
           : SingleFlight<bool>(refreshSession),
       _isAuthRoute = isAuthRoute ?? ((_) => false);

  static const _retriedKey = 'skies.auth.retried';

  final Dio _dio;
  final AccessTokenProvider _accessToken;
  final SingleFlight<bool>? _refreshGate;
  final AuthRoutePredicate _isAuthRoute;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _accessToken();
    if (token != null && token.trim().isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final request = err.requestOptions;
    final mayRefresh =
        err.response?.statusCode == 401 &&
        request.extra[_retriedKey] != true &&
        _refreshGate != null &&
        !_isAuthRoute(request);
    if (!mayRefresh || !await _refreshOnce()) {
      handler.next(err);
      return;
    }

    request.extra[_retriedKey] = true;
    final token = await _accessToken();
    if (token == null || token.trim().isEmpty) {
      handler.next(err);
      return;
    }

    request.headers['Authorization'] = 'Bearer $token';
    try {
      handler.resolve(await _dio.fetch<Object?>(request));
    } on DioException catch (replayError) {
      handler.next(replayError);
    }
  }

  Future<bool> _refreshOnce() => _refreshGate?.call() ?? Future.value(false);
}
