import 'package:flutter/widgets.dart';

import 'async_state.dart';

/// Renders every member of an [AsyncState] through app-owned presentation builders.
final class ResourceBuilder<T> extends StatelessWidget {
  /// Creates a resource renderer with an explicit surface for every state.
  const ResourceBuilder({
    required this.state,
    required this.loading,
    required this.empty,
    required this.failure,
    required this.ready,
    this.retry,
    super.key,
  });

  /// The closed resource state supplied by the ViewModel.
  final AsyncState<T> state;

  /// Builds the loading surface.
  final WidgetBuilder loading;

  /// Builds the empty surface.
  final WidgetBuilder empty;

  /// Builds the failure surface with its retry command.
  final Widget Function(BuildContext context, Object error, AsyncRetry? retry)
  failure;

  /// Builds the resolved content.
  final Widget Function(BuildContext context, T data) ready;

  /// Optionally overrides the retry command carried by [AsyncFailure].
  final AsyncRetry? retry;

  @override
  Widget build(BuildContext context) => state.when(
    loading: () => loading(context),
    empty: () => empty(context),
    failure: (error, _, stateRetry) =>
        failure(context, error, retry ?? stateRetry),
    ready: (data) => ready(context, data),
  );
}
