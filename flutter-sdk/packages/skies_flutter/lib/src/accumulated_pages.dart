import 'package:flutter/foundation.dart';

import 'page.dart';

/// The render facts of a load-more accumulation.
final class Accumulation<T> {
  /// Creates an accumulated list and its continuation fact.
  const Accumulation({required this.items, required this.hasMore});

  /// Every item folded so far in arrival order.
  final List<T> items;

  /// Whether the authoritative total indicates another page.
  final bool hasMore;
}

/// Owns load-more state and stable key-based deduplication without fetching.
final class AccumulatedPages<T, K> extends ChangeNotifier {
  /// Creates an accumulation controller for one resource scope.
  AccumulatedPages({required K Function(T item) keyOf, Object? resetKey})
    : _keyOf = keyOf,
      _resetKey = resetKey;

  final K Function(T item) _keyOf;
  Object? _resetKey;
  Page<T>? _folded;
  List<T> _items = <T>[];
  int _totalCount = 0;
  int _page = 1;

  /// The one-based page passed to the generated operation.
  int get page => _page;

  /// Starts a fresh resource scope while retaining placeholder-page identity.
  void updateResetKey(Object? value) {
    if (value == _resetKey) return;
    _resetKey = value;
    _items = <T>[];
    _totalCount = 0;
    _page = 1;
    notifyListeners();
  }

  /// Folds a stable page identity into the accumulated list.
  Accumulation<T> fold(Page<T>? current) {
    if (current == null || identical(current, _folded)) return _result;
    final next = current.pageNumber <= 1
        ? List<T>.of(current.items)
        : _merge(current.items);
    _items = next;
    _totalCount = current.totalCount;
    _folded = current;
    notifyListeners();
    return _result;
  }

  /// Advances only when the current accumulation has more authoritative items.
  void loadMore() {
    if (_items.length >= _totalCount) return;
    _page += 1;
    notifyListeners();
  }

  /// Rewinds so a refetched first page replaces the accumulation.
  void reset() {
    if (_page == 1) return;
    _page = 1;
    notifyListeners();
  }

  Accumulation<T> get _result => Accumulation<T>(
    items: List<T>.unmodifiable(_items),
    hasMore: _items.length < _totalCount,
  );

  List<T> _merge(List<T> incoming) {
    final fresh = <K, T>{for (final item in incoming) _keyOf(item): item};
    final previousKeys = _items.map(_keyOf).toSet();
    return <T>[
      for (final item in _items) fresh[_keyOf(item)] ?? item,
      for (final item in incoming)
        if (!previousKeys.contains(_keyOf(item))) item,
    ];
  }
}
