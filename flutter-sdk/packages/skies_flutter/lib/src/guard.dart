import 'session.dart';

/// The closed decision returned by a router-independent session guard.
sealed class GuardOutcome<H> {
  /// Creates a guard outcome.
  const GuardOutcome();
}

/// A decision to wait while identity is unresolved.
final class GuardWait<H> extends GuardOutcome<H> {
  /// Creates a wait outcome.
  const GuardWait();
}

/// A decision to render the guarded route.
final class GuardRender<H> extends GuardOutcome<H> {
  /// Creates a render outcome.
  const GuardRender();
}

/// A decision to redirect to a typed route.
final class GuardRedirect<H> extends GuardOutcome<H> {
  /// Creates a redirect outcome.
  const GuardRedirect(this.to);

  /// The typed destination owned by the app router.
  final H to;
}

/// The closed access policy accepted by [guardSession].
sealed class SessionAccess<U> {
  /// Creates a session access policy.
  const SessionAccess();

  /// Allows every authenticated identity.
  const factory SessionAccess.authenticated() = AuthenticatedAccess<U>;

  /// Allows only an anonymous visitor.
  const factory SessionAccess.anonymous() = AnonymousAccess<U>;

  /// Allows an authenticated identity satisfying [allows].
  const factory SessionAccess.capability(bool Function(U user) allows) =
      CapabilityAccess<U>;
}

/// Access for any authenticated identity.
final class AuthenticatedAccess<U> extends SessionAccess<U> {
  /// Creates authenticated access.
  const AuthenticatedAccess();
}

/// Access for an anonymous visitor.
final class AnonymousAccess<U> extends SessionAccess<U> {
  /// Creates anonymous access.
  const AnonymousAccess();
}

/// Access selected by a capability predicate over an authenticated user.
final class CapabilityAccess<U> extends SessionAccess<U> {
  /// Creates capability-based access.
  const CapabilityAccess(this.allows);

  /// Decides whether the authenticated user owns the required capability.
  final bool Function(U user) allows;
}

/// Decides a route guard as pure data without navigating.
GuardOutcome<H> guardSession<U, H>(
  SessionState<U> session, {
  required SessionAccess<U> allow,
  required H redirectTo,
}) {
  if (session is SessionLoading<U>) return GuardWait<H>();
  final allowed = switch (allow) {
    AuthenticatedAccess<U>() => session is SessionAuthenticated<U>,
    AnonymousAccess<U>() => session is SessionAnonymous<U>,
    CapabilityAccess<U>(:final allows) =>
      session is SessionAuthenticated<U> && allows(session.user),
  };
  return allowed ? GuardRender<H>() : GuardRedirect<H>(redirectTo);
}
