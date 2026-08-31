import 'dart:async';

/// The one application-owned surface for transient feedback.
abstract interface class FeedbackSink {
  /// Shows successful command feedback.
  FutureOr<void> success(String message);

  /// Shows failed command feedback.
  FutureOr<void> error(Object error);
}

/// Applies global cache-coherence and feedback defaults to every command.
final class MutationBoundary {
  /// Creates a write boundary from app-owned cache and feedback ports.
  const MutationBoundary({
    required FutureOr<void> Function() invalidateQueries,
    required FeedbackSink feedback,
  }) : _invalidateQueries = invalidateQueries,
       _feedback = feedback;

  final FutureOr<void> Function() _invalidateQueries;
  final FeedbackSink _feedback;

  /// Executes one mutation, always surfacing failure and invalidating after success.
  Future<T> run<T>(
    Future<T> Function() mutation, {
    required String successMessage,
    bool silentSuccess = false,
    bool expectedFailure = false,
  }) async {
    try {
      final result = await mutation();
      await _invalidateQueries();
      if (!silentSuccess) await _feedback.success(successMessage);
      return result;
    } on Object catch (error) {
      if (!expectedFailure) await _feedback.error(error);
      rethrow;
    }
  }
}
