import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:skies_flutter/skies_flutter.dart';

void main() {
  test('transient current-user failures defer instead of signing out', () {
    expect(
      toSessionState<String>(
        isPending: false,
        isError: true,
        isUnauthorized: false,
        data: null,
      ),
      isA<SessionLoading<String>>(),
    );
    expect(
      toSessionState<String>(
        isPending: false,
        isError: true,
        isUnauthorized: true,
        data: null,
      ),
      isA<SessionAnonymous<String>>(),
    );
  });

  test(
    'guard is symmetric for authenticated, anonymous, and capability routes',
    () {
      const authenticated = SessionAuthenticated<String>('admin');
      const anonymous = SessionAnonymous<String>();
      expect(
        guardSession(
          authenticated,
          allow: const SessionAccess<String>.authenticated(),
          redirectTo: '/login',
        ),
        isA<GuardRender<String>>(),
      );
      expect(
        guardSession(
          authenticated,
          allow: const SessionAccess<String>.anonymous(),
          redirectTo: '/home',
        ),
        isA<GuardRedirect<String>>(),
      );
      expect(
        guardSession(
          authenticated,
          allow: SessionAccess.capability((user) => user == 'admin'),
          redirectTo: '/home',
        ),
        isA<GuardRender<String>>(),
      );
      expect(
        guardSession(
          anonymous,
          allow: const SessionAccess<String>.authenticated(),
          redirectTo: '/login',
        ),
        isA<GuardRedirect<String>>(),
      );
    },
  );

  test(
    'single flight shares an active execution and reopens after settlement',
    () async {
      var calls = 0;
      final release = Completer<int>();
      final flight = SingleFlight<int>(() {
        calls++;
        return release.future;
      });
      final first = flight();
      final second = flight();
      expect(identical(first, second), isTrue);
      expect(calls, 1);
      release.complete(4);
      expect(await first, 4);
    },
  );

  test('session seam separates identity wipe from light rotation', () async {
    final access = <String?>[];
    final store = _MemoryStore('old-refresh');
    var identityChanges = 0;
    var sessionChanges = 0;
    var refreshes = 0;
    final seam = SessionSeam(
      setAccessToken: access.add,
      refresh: (token) async {
        refreshes++;
        expect(token, 'old-refresh');
        return const AuthTokens(
          accessToken: 'rotated',
          refreshToken: 'new-refresh',
        );
      },
      onIdentityChanged: () => identityChanges++,
      onSessionChanged: () => sessionChanges++,
      store: store,
    );

    await Future.wait([seam.bootstrapSession(), seam.bootstrapSession()]);
    expect(refreshes, 1);
    expect(sessionChanges, 1);
    expect(identityChanges, 0);
    expect(store.token, 'new-refresh');

    await seam.signIn(const AuthTokens(accessToken: 'signed-in'));
    await seam.clearSession();
    expect(identityChanges, 2);
    expect(access.last, isNull);
    expect(store.token, isEmpty);
  });

  test('bootstrap timeout opens the navigation gate', () async {
    final never = Completer<void>();
    final gate = SessionBootstrap(
      bootstrap: () => never.future,
      timeout: const Duration(milliseconds: 1),
    );
    await gate.start();
    expect(gate.ready, isTrue);
  });
}

final class _MemoryStore implements RefreshTokenStore {
  _MemoryStore(this.token);

  String token;

  @override
  Future<void> clear() async => token = '';

  @override
  Future<String> load() async => token;

  @override
  Future<void> save(String value) async => token = value;
}
