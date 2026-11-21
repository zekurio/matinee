import 'package:flutter/foundation.dart';

import '../api/matinee_api.dart';
import 'unreachability.dart';

/// Where the app is between picking a server and using it.
@immutable
sealed class AuthState {
  const AuthState();
}

/// Picking a server to add. [canCancel] while another one is saved and in
/// use, which going back returns to as it was.
final class NoServer extends AuthState {
  const NoServer({this.canCancel = false});

  final bool canCancel;
}

final class Connecting extends AuthState {
  const Connecting(this.server);

  final String server;
}

/// A saved server that didn't answer; the app offers to try again, and does
/// on its own when the network comes back. [retrying] while it does.
final class Unreachable extends AuthState {
  const Unreachable(this.server, this.reason, {this.retrying = false});

  final String server;
  final Unreachability reason;
  final bool retrying;

  Unreachable withRetrying(bool value) =>
      Unreachable(server, reason, retrying: value);
}

/// Signing in to [server]. [adding] while it's a server being added, not
/// saved until the sign-in succeeds; going back returns to the one in use.
final class SignedOut extends AuthState {
  const SignedOut(this.server, this.config, {this.adding = false});

  final String server;
  final AuthConfig config;
  final bool adding;
}

final class SignedIn extends AuthState {
  const SignedIn(this.server, this.user);

  final String server;
  final User user;
}

/// The server is away, and the app shows what's downloaded.
final class Offline extends AuthState {
  const Offline(this.server, this.user);

  final String server;
  final User user;
}

/// A server saved on this device, as the server list shows it.
@immutable
final class SavedServer {
  const SavedServer({
    required this.origin,
    required this.address,
    required this.name,
    required this.user,
    required this.active,
  });

  /// The server's root, as `https://media.example.com/`, which names it
  /// across the app.
  final String origin;

  /// Its address as the app shows it, `https://media.example.com`.
  final String address;

  /// What it calls itself, when it was found on the local network.
  final String? name;

  /// The account signed in there, or null while signed out.
  final User? user;

  /// The one in use.
  final bool active;
}

/// Everything the session shows: the auth state, the saved servers, and the
/// one in use.
@immutable
final class SessionState {
  const SessionState({
    required this.auth,
    required this.servers,
    required this.activeServer,
    required this.removing,
    required this.version,
  });

  final AuthState auth;

  /// The saved servers, in the order they were added.
  final List<SavedServer> servers;

  /// The origin of the saved server in use, as [SavedServer.origin]. It
  /// stays while another server is being added, and is null only while no
  /// server is saved.
  final String? activeServer;

  /// The servers being removed, while their sessions end.
  final Set<String> removing;

  /// Changes when the active sign-in or server changes: a client made before
  /// stops sending its token.
  final int version;

  SessionState copyWith({
    AuthState? auth,
    List<SavedServer>? servers,
    (String?,)? activeServer,
    Set<String>? removing,
    int? version,
  }) => SessionState(
    auth: auth ?? this.auth,
    servers: servers ?? this.servers,
    activeServer: activeServer == null ? this.activeServer : activeServer.$1,
    removing: removing ?? this.removing,
    version: version ?? this.version,
  );
}
