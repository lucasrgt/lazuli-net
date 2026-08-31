import 'dart:async';

/// Forces a form submit to carry both valid and invalid behavior.
Future<TField?> submitOrReveal<TField>({
  required bool Function() validate,
  required Iterable<TField> Function() invalidFields,
  required FutureOr<void> Function() onValid,
  required FutureOr<void> Function(TField firstInvalid) onInvalid,
  Iterable<TField>? order,
}) async {
  if (validate()) {
    await onValid();
    return null;
  }
  final invalid = invalidFields().toList(growable: false);
  if (invalid.isEmpty) return null;
  final visualOrder = order?.toList(growable: false) ?? <TField>[];
  final first = visualOrder.firstWhere(
    invalid.contains,
    orElse: () => invalid.first,
  );
  await onInvalid(first);
  return first;
}
