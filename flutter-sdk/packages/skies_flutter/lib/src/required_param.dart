/// The closed presence state of a required route parameter.
sealed class RequiredParam {
  /// Creates a required-parameter state.
  const RequiredParam();
}

/// A route parameter that was absent or empty.
final class MissingParam extends RequiredParam {
  /// Creates a missing route parameter.
  const MissingParam();
}

/// A normalized non-empty route parameter.
final class ReadyParam extends RequiredParam {
  /// Creates a ready route parameter.
  const ReadyParam(this.value);

  /// The normalized first value supplied by the router.
  final String value;
}

/// Normalizes a scalar or repeated router parameter into a closed presence state.
RequiredParam requiredParam(Object? raw) {
  final value = switch (raw) {
    String value => value,
    List<Object?> values when values.isNotEmpty =>
      values.first?.toString() ?? '',
    _ => '',
  };
  return value.isEmpty ? const MissingParam() : ReadyParam(value);
}
