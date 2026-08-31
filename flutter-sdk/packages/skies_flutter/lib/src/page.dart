/// The structural page shape shared with the Skies backend contract.
final class Page<T> {
  /// Creates one server-authoritative page.
  Page({
    required Iterable<T> items,
    required this.totalCount,
    required this.pageNumber,
    required this.pageSize,
  }) : items = List<T>.unmodifiable(items);

  /// The items returned for this page.
  final List<T> items;

  /// The total filtered item count across every page.
  final int totalCount;

  /// The one-based page number actually served.
  final int pageNumber;

  /// The page size actually served.
  final int pageSize;
}

/// Render-ready facts derived from one [Page].
final class PageInfo {
  /// Creates pagination facts.
  const PageInfo({
    required this.pageCount,
    required this.from,
    required this.to,
    required this.totalCount,
    required this.hasPrevious,
    required this.hasNext,
  });

  /// The total number of pages, never below one.
  final int pageCount;

  /// The one-based first item position, or zero for an empty result.
  final int from;

  /// The one-based last item position, or zero for an empty result.
  final int to;

  /// The total filtered item count.
  final int totalCount;

  /// Whether a previous page exists.
  final bool hasPrevious;

  /// Whether a following page exists.
  final bool hasNext;
}

/// Derives render facts without leaking pagination arithmetic into a View.
PageInfo? toPageInfo(Page<Object?>? page) {
  if (page == null) return null;
  final pageSize = page.pageSize < 1 ? 1 : page.pageSize;
  final pageCount = (page.totalCount / pageSize).ceil().clamp(1, 1 << 31);
  final from = page.items.isEmpty ? 0 : (page.pageNumber - 1) * pageSize + 1;
  final to = page.items.isEmpty ? 0 : from + page.items.length - 1;
  return PageInfo(
    pageCount: pageCount,
    from: from,
    to: to,
    totalCount: page.totalCount,
    hasPrevious: page.pageNumber > 1,
    hasNext: page.pageNumber < pageCount,
  );
}
