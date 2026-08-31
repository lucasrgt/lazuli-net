import 'dart:async';

import 'package:flutter/foundation.dart';

/// Owns numbered-page and debounced-search state without owning a request.
final class Pager extends ChangeNotifier {
  /// Creates a fetch-agnostic pager controller.
  Pager({
    Duration debounce = const Duration(milliseconds: 300),
    String initialQuery = '',
    int? initialPageSize,
    int initialPage = 1,
    void Function(int page)? onPageChanged,
  }) : _debounce = debounce,
       _query = initialQuery,
       _settledQuery = initialQuery.trim(),
       _pageSize = initialPageSize,
       _page = initialPage < 1 ? 1 : initialPage,
       _onPageChanged = onPageChanged;

  final Duration _debounce;
  final void Function(int page)? _onPageChanged;
  Timer? _timer;
  int _page;
  int? _pageSize;
  String _query;
  String _settledQuery;

  /// The one-based page passed to the generated operation.
  int get page => _page;

  /// The configured page size, when the endpoint accepts one.
  int? get pageSize => _pageSize;

  /// The live search-field value.
  String get query => _query;

  /// The trimmed, debounced value passed to the generated operation.
  String get settledQuery => _settledQuery;

  /// Updates the live query and rewinds only when a new settled value arrives.
  set query(String value) {
    if (_query == value) return;
    _query = value;
    _timer?.cancel();
    _timer = Timer(_debounce, () {
      final settled = _query.trim();
      if (_settledQuery == settled) return;
      _settledQuery = settled;
      _commitPage(1);
      notifyListeners();
    });
    notifyListeners();
  }

  /// Changes the page size and rewinds to the first page.
  void setPageSize(int pageSize) {
    if (pageSize < 1) throw ArgumentError.value(pageSize, 'pageSize');
    if (_pageSize == pageSize) return;
    _pageSize = pageSize;
    _commitPage(1);
    notifyListeners();
  }

  /// Advances one page, clamped when [pageCount] is known.
  void next([int? pageCount]) => goTo(_page + 1, pageCount);

  /// Moves back one page without crossing page one.
  void previous() => goTo(_page - 1);

  /// Moves to [target], clamped to the known page range.
  void goTo(int target, [int? pageCount]) {
    final upper = pageCount == null || pageCount < 1 ? null : pageCount;
    final next = upper == null
        ? target.clamp(1, 1 << 31)
        : target.clamp(1, upper);
    if (_commitPage(next)) notifyListeners();
  }

  /// Rewinds to page one while preserving the search value.
  void reset() => goTo(1);

  bool _commitPage(int next) {
    if (_page == next) return false;
    _page = next;
    _onPageChanged?.call(next);
    return true;
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
