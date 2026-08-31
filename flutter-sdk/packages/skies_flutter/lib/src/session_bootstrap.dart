import 'dart:async';

import 'package:flutter/foundation.dart';

/// Gates navigation until the one session-bootstrap attempt settles or times out.
final class SessionBootstrap extends ChangeNotifier {
  /// Creates a cold-start session gate.
  SessionBootstrap({
    required Future<Object?> Function() bootstrap,
    Duration? timeout,
  }) : _bootstrap = bootstrap,
       _timeout = timeout;

  final Future<Object?> Function() _bootstrap;
  final Duration? _timeout;
  Future<void>? _started;
  bool _ready = false;

  /// Whether the navigator may render and let a session guard decide.
  bool get ready => _ready;

  /// Starts the bootstrap once; repeated calls share the same settlement.
  Future<void> start() => _started ??= _run();

  Future<void> _run() async {
    final bootstrap = _bootstrap().then<void>((_) {}, onError: (_) {});
    final timeout = _timeout;
    if (timeout == null) {
      await bootstrap;
    } else {
      await Future.any<void>([bootstrap, Future<void>.delayed(timeout)]);
    }
    _ready = true;
    notifyListeners();
  }
}
