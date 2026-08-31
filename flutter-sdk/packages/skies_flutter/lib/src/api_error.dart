import 'skies_api_exception.dart';

/// Reads a stable backend error code from a generated error body.
typedef ErrorCodeReader = String? Function(Object body);

/// The localization capabilities required by [apiErrorCopy].
abstract interface class SkiesLocalizations {
  /// Whether [key] exists in the assembled application catalog.
  bool exists(String key);

  /// Resolves localized copy for [key].
  String text(String key);
}

/// Reads the canonical error code carried by a typed Skies failure.
String? apiErrorCode(Object? error, {required ErrorCodeReader readCode}) {
  if (error is! SkiesApiException<Object>) return null;
  final body = error.body;
  if (body == null) return null;
  final code = readCode(body);
  return code == null || code.isEmpty ? null : code;
}

/// Resolves backend error copy through the app catalog with a generic fallback.
String? apiErrorCopy(
  Object? error,
  SkiesLocalizations localizations, {
  required ErrorCodeReader readCode,
  String namespace = 'apiErrors',
  String fallbackKey = 'common.state.loadError',
}) {
  if (error == null) return null;
  final code = apiErrorCode(error, readCode: readCode);
  final key = code == null ? null : '$namespace.$code';
  return key != null && localizations.exists(key)
      ? localizations.text(key)
      : localizations.text(fallbackKey);
}
