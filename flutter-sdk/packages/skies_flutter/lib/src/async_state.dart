import 'dart:async';

/// Retries an asynchronous resource without constraining how the caller awaits it.
typedef AsyncRetry = FutureOr<void> Function();

/// The closed set of states for one asynchronous resource displayed by a View.
sealed class AsyncState<T> {
  /// Creates an asynchronous resource state.
  const AsyncState();

  /// Projects every state explicitly, so a View cannot forget a sad path.
  R when<R>({
    required R Function() loading,
    required R Function() empty,
    required R Function(Object error, StackTrace stackTrace, AsyncRetry? retry)
    failure,
    required R Function(T data) ready,
  }) => switch (this) {
    AsyncLoading<T>() => loading(),
    AsyncEmpty<T>() => empty(),
    AsyncFailure<T>(:final error, :final stackTrace, :final retry) => failure(
      error,
      stackTrace,
      retry,
    ),
    AsyncReady<T>(:final data) => ready(data),
  };

  /// Projects a ready payload while preserving every non-ready state.
  AsyncState<R> map<R>(R Function(T data) project) => switch (this) {
    AsyncLoading<T>() => AsyncLoading<R>(),
    AsyncEmpty<T>() => AsyncEmpty<R>(),
    AsyncFailure<T>(:final error, :final stackTrace, :final retry) =>
      AsyncFailure<R>(error, stackTrace, retry: retry),
    AsyncReady<T>(:final data) => AsyncReady<R>(project(data)),
  };
}

/// A resource whose first or refreshed value is being loaded.
final class AsyncLoading<T> extends AsyncState<T> {
  /// Creates a loading state.
  const AsyncLoading();
}

/// A successfully loaded resource with no displayable items.
final class AsyncEmpty<T> extends AsyncState<T> {
  /// Creates an empty state.
  const AsyncEmpty();
}

/// A resource that could not be loaded.
final class AsyncFailure<T> extends AsyncState<T> {
  /// Creates a failure while preserving its diagnostic stack.
  const AsyncFailure(this.error, this.stackTrace, {this.retry});

  /// The failure exposed to the View for presentation mapping.
  final Object error;

  /// The original stack trace retained for diagnostics.
  final StackTrace stackTrace;

  /// The optional command that retries every failed source represented here.
  final AsyncRetry? retry;
}

/// Projects request facts into the closed state a View consumes.
AsyncState<T> toAsyncState<T>({
  required bool isLoading,
  required T? data,
  Object? error,
  StackTrace? stackTrace,
  AsyncRetry? retry,
  bool Function(T data)? isEmpty,
}) {
  if (isLoading) return AsyncLoading<T>();
  if (error != null || data == null) {
    return AsyncFailure<T>(
      error ?? StateError('The asynchronous request completed without data.'),
      stackTrace ?? StackTrace.empty,
      retry: retry,
    );
  }
  if (isEmpty?.call(data) ?? false) return AsyncEmpty<T>();
  return AsyncReady<T>(data);
}

/// Combines two resources with `failure > loading > empty > ready` precedence.
AsyncState<(A, B)> combineAsyncStates2<A, B>(
  AsyncState<A> first,
  AsyncState<B> second,
) {
  final failure = _combinedFailure<(A, B)>([first, second]);
  if (failure != null) return failure;
  if (first is AsyncLoading<A> || second is AsyncLoading<B>) {
    return AsyncLoading<(A, B)>();
  }
  if (first is AsyncEmpty<A> || second is AsyncEmpty<B>) {
    return AsyncEmpty<(A, B)>();
  }
  return AsyncReady<(A, B)>((
    (first as AsyncReady<A>).data,
    (second as AsyncReady<B>).data,
  ));
}

/// Combines three resources with `failure > loading > empty > ready` precedence.
AsyncState<(A, B, C)> combineAsyncStates3<A, B, C>(
  AsyncState<A> first,
  AsyncState<B> second,
  AsyncState<C> third,
) {
  final failure = _combinedFailure<(A, B, C)>([first, second, third]);
  if (failure != null) return failure;
  if (first is AsyncLoading<A> ||
      second is AsyncLoading<B> ||
      third is AsyncLoading<C>) {
    return AsyncLoading<(A, B, C)>();
  }
  if (first is AsyncEmpty<A> ||
      second is AsyncEmpty<B> ||
      third is AsyncEmpty<C>) {
    return AsyncEmpty<(A, B, C)>();
  }
  return AsyncReady<(A, B, C)>((
    (first as AsyncReady<A>).data,
    (second as AsyncReady<B>).data,
    (third as AsyncReady<C>).data,
  ));
}

AsyncFailure<T>? _combinedFailure<T>(List<AsyncState<Object?>> states) {
  final failures = states.whereType<AsyncFailure<Object?>>().toList(
    growable: false,
  );
  if (failures.isEmpty) return null;
  final retries = failures
      .map((failure) => failure.retry)
      .whereType<AsyncRetry>()
      .toList(growable: false);
  return AsyncFailure<T>(
    failures.first.error,
    failures.first.stackTrace,
    retry: retries.isEmpty
        ? null
        : () async {
            for (final retry in retries) {
              await retry();
            }
          },
  );
}

/// A successfully loaded resource with displayable data.
final class AsyncReady<T> extends AsyncState<T> {
  /// Creates a ready state.
  const AsyncReady(this.data);

  /// The data the View may render.
  final T data;
}
