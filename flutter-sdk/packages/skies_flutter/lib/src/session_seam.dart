import 'dart:async';

import 'single_flight.dart';

/// The access and refresh credentials returned by authentication operations.
final class AuthTokens {
  /// Creates an authentication result whose halves may independently be absent.
  const AuthTokens({this.accessToken, this.refreshToken});

  /// The short-lived bearer credential.
  final String? accessToken;

  /// The rotated credential persisted only in secure app-owned storage.
  final String? refreshToken;
}

/// The native secure-storage port used by the session seam.
abstract interface class RefreshTokenStore {
  /// Loads the current refresh credential, or an empty string when absent.
  Future<String> load();

  /// Persists the newest rotated credential.
  Future<void> save(String token);

  /// Clears the credential during sign-out.
  Future<void> clear();
}

/// The only write-side door through which application identity changes.
final class SessionSeam {
  /// Creates the session seam from transport, storage, token, and cache ports.
  SessionSeam({
    required void Function(String? token) setAccessToken,
    required Future<AuthTokens?> Function(String refreshToken) refresh,
    required FutureOr<void> Function() onIdentityChanged,
    FutureOr<void> Function()? onSessionChanged,
    RefreshTokenStore? store,
  }) : _setAccessToken = setAccessToken,
       _refresh = refresh,
       _onIdentityChanged = onIdentityChanged,
       _onSessionChanged = onSessionChanged,
       _store = store ?? const _EmptyRefreshTokenStore() {
    _bootstrap = SingleFlight<bool>(_bootstrapOnce);
  }

  final void Function(String? token) _setAccessToken;
  final Future<AuthTokens?> Function(String refreshToken) _refresh;
  final FutureOr<void> Function() _onIdentityChanged;
  final FutureOr<void> Function()? _onSessionChanged;
  final RefreshTokenStore _store;
  late final SingleFlight<bool> _bootstrap;

  /// Persists an explicit sign-in and totally clears prior-identity caches.
  Future<void> signIn(AuthTokens tokens) async {
    await _persist(tokens);
    await _onIdentityChanged();
  }

  /// Performs one single-flight refresh rotation and lightly resets session caches.
  Future<bool> bootstrapSession() => _bootstrap();

  /// Clears local credentials and totally clears prior-identity caches.
  Future<void> clearSession() async {
    _setAccessToken(null);
    await _store.clear();
    await _onIdentityChanged();
  }

  Future<bool> _bootstrapOnce() async {
    try {
      final tokens = await _refresh(await _store.load());
      if (tokens == null) return false;
      await _persist(tokens);
      final changed = _onSessionChanged;
      if (changed != null) await changed();
      return true;
    } on Object {
      return false;
    }
  }

  Future<void> _persist(AuthTokens tokens) async {
    final accessToken = tokens.accessToken;
    if (accessToken != null && accessToken.isNotEmpty) {
      _setAccessToken(accessToken);
    }
    final refreshToken = tokens.refreshToken;
    if (refreshToken != null && refreshToken.isNotEmpty) {
      await _store.save(refreshToken);
    }
  }
}

final class _EmptyRefreshTokenStore implements RefreshTokenStore {
  const _EmptyRefreshTokenStore();

  @override
  Future<void> clear() async {}

  @override
  Future<String> load() async => '';

  @override
  Future<void> save(String token) async {}
}
