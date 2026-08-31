import 'package:flutter_test/flutter_test.dart';
import 'package:skies_flutter/skies_flutter.dart';

void main() {
  test('page info derives bounds and navigation facts', () {
    final page = Page<int>(
      items: [21, 22],
      totalCount: 22,
      pageNumber: 3,
      pageSize: 10,
    );
    final info = toPageInfo(page);
    expect(info?.pageCount, 3);
    expect(info?.from, 21);
    expect(info?.to, 22);
    expect(info?.hasPrevious, isTrue);
    expect(info?.hasNext, isFalse);
    expect(() => page.items.add(23), throwsUnsupportedError);
  });

  test('pager clamps pages and rewinds after settled search', () async {
    final pages = <int>[];
    final pager = Pager(
      debounce: const Duration(milliseconds: 1),
      initialPage: 3,
      onPageChanged: pages.add,
    );
    pager.next(3);
    expect(pager.page, 3);
    pager.previous();
    expect(pager.page, 2);
    pager.query = ' wallet ';
    await Future<void>.delayed(const Duration(milliseconds: 5));
    expect(pager.settledQuery, 'wallet');
    expect(pager.page, 1);
    expect(pages, [2, 1]);
    pager.dispose();
  });

  test('accumulation replaces the head and deduplicates moving boundaries', () {
    final pages = AccumulatedPages<_Item, int>(keyOf: (item) => item.id);
    var notifications = 0;
    pages.addListener(() => notifications++);
    var result = pages.fold(
      Page<_Item>(
        items: const [_Item(1, 'old'), _Item(2, 'two')],
        totalCount: 3,
        pageNumber: 1,
        pageSize: 2,
      ),
    );
    expect(result.hasMore, isTrue);
    pages.loadMore();
    result = pages.fold(
      Page<_Item>(
        items: const [_Item(1, 'fresh'), _Item(3, 'three')],
        totalCount: 3,
        pageNumber: 2,
        pageSize: 2,
      ),
    );
    expect(result.items.map((item) => item.label), ['fresh', 'two', 'three']);
    expect(result.hasMore, isFalse);
    expect(notifications, 3);
  });
}

final class _Item {
  const _Item(this.id, this.label);

  final int id;
  final String label;
}
