import 'dart:async';

/// Collapses concurrent calls into one in-flight asynchronous execution.
final class SingleFlight<T> {
  /// Creates a reusable single-flight gate around [operation].
  SingleFlight(this.operation);

  /// The operation whose active result concurrent callers share.
  final Future<T> Function() operation;

  Future<T>? _inFlight;

  /// Runs a fresh operation only when no earlier execution remains active.
  Future<T> call() {
    final active = _inFlight;
    if (active != null) return active;
    final next = Future<T>.sync(operation);
    _inFlight = next;
    void clear() {
      if (identical(_inFlight, next)) _inFlight = null;
    }

    next.then<void>(
      (_) => clear(),
      onError: (Object _, StackTrace _) => clear(),
    );
    return next;
  }
}
