/// The typed navigation capabilities required by [safeBack].
abstract interface class BackRouter<H> {
  /// Whether this router owns an in-app entry it can pop.
  bool canGoBack();

  /// Pops one in-app entry.
  void back();

  /// Replaces the current entry with [destination].
  void replace(H destination);
}

/// Pops in-app history or replaces with [fallback] after a deep link.
void safeBack<H>(BackRouter<H> router, H fallback) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
