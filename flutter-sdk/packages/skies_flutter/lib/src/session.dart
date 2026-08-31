/// The closed identity state a route guard consumes.
sealed class SessionState<U> {
  /// Creates a session state.
  const SessionState();
}

/// A session whose current identity is still being resolved.
final class SessionLoading<U> extends SessionState<U> {
  /// Creates a loading session.
  const SessionLoading();
}

/// A session carrying its authenticated user.
final class SessionAuthenticated<U> extends SessionState<U> {
  /// Creates an authenticated session.
  const SessionAuthenticated(this.user);

  /// The current user.
  final U user;
}

/// A settled session with no authenticated user.
final class SessionAnonymous<U> extends SessionState<U> {
  /// Creates an anonymous session.
  const SessionAnonymous();
}

/// Projects current-user request facts without treating a transient failure as sign-out.
SessionState<U> toSessionState<U>({
  required bool isPending,
  required bool isError,
  required bool isUnauthorized,
  required U? data,
}) {
  if (isPending) return SessionLoading<U>();
  if (isError) {
    return isUnauthorized ? SessionAnonymous<U>() : SessionLoading<U>();
  }
  if (data == null) return SessionAnonymous<U>();
  return SessionAuthenticated<U>(data);
}
