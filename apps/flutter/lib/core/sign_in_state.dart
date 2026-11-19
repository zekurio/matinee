import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/matinee_api.dart';
import '../l10n/app_localizations.dart';
import 'device.dart';
import 'device_codes.dart';
import 'local_network.dart';
import 'server_discovery.dart';
import 'session.dart';
import 'unreachability.dart';

/* What the sign-in screens do, apart from how they look, for the phone's
   screens and the TV's alike. */

// ---- Connecting to a server ----

/// Connecting to the server the person typed or picked: whether it's under
/// way, and what went wrong.
final class ServerConnectState {
  const ServerConnectState({
    this.busy = false,
    this.error,
    this.localNetworkHint = false,
  });

  final bool busy;
  final ConnectFailure? error;

  /// Local network access is still missing, which may be why a server on the
  /// LAN didn't answer: the screen says where to allow it.
  final bool localNetworkHint;
}

final class ServerConnect extends Notifier<ServerConnectState> {
  @override
  ServerConnectState build() => const ServerConnectState();

  /// Try [address], unless a try is under way, asking for local network
  /// access first where Android needs it. Once it answers, the session
  /// moves on to signing in. [name] is what a server found nearby calls
  /// itself.
  Future<void> connect(String address, {String? name}) async {
    if (state.busy) return;
    state = const ServerConnectState(busy: true);
    final access = ref.read(localNetworkProvider);
    final session = ref.read(sessionProvider.notifier);
    final failure = await withLocalNetwork(
      access,
      () => session.connect(address, name: name),
    );
    // Without the access a LAN server only says it can't be reached.
    final hint = failure != null && await access.missing();
    if (!ref.mounted) return;
    state = ServerConnectState(error: failure, localNetworkHint: hint);
  }

  void clearError() {
    if (state.error != null) state = const ServerConnectState();
  }
}

final serverConnectProvider =
    NotifierProvider.autoDispose<ServerConnect, ServerConnectState>(
      ServerConnect.new,
    );

/// A connection failure in a line, with where to allow local network access
/// when that may be the cause.
String describeConnectFailure(
  AppLocalizations l,
  ConnectFailure failure, {
  bool localNetworkHint = false,
}) {
  final text = switch (failure.kind) {
    ConnectFailureKind.empty => l.connectEmpty,
    ConnectFailureKind.notMatinee => l.connectNotMatinee(failure.server ?? ''),
    ConnectFailureKind.failed => l.connectFailed(failure.server ?? ''),
  };
  return localNetworkHint ? '$text\n${l.connectLocalNetwork}' : text;
}

/// A browser sign-in failure in a line. The server's own words come as they
/// are; translating them is the screens' business.
String describeSignInFailure(AppLocalizations l, SignInFailure failure) =>
    switch (failure.kind) {
      SignInFailureKind.wrongState => l.signinWrongState,
      SignInFailureKind.server => failure.serverMessage ?? l.signinFailed,
      SignInFailureKind.generic => l.signinFailed,
    };

// ---- Signing in with a code ----

/// The OAuth device grant under way: the code to show once it came, and what
/// went wrong. [expired] once the code ran out, when it isn't renewed on its
/// own. A poll that fails tries again on its own.
final class DeviceCodeSignInState {
  const DeviceCodeSignInState({this.code, this.error, this.expired = false});

  final DeviceCode? code;

  /// What the last start or poll threw, for the screen to describe.
  final Object? error;
  final bool expired;
}

/// Starts the device grant and polls until someone signed in approves this
/// device, then signs the session in. A code that expires is replaced at
/// once when [renewExpired], with a new QR code; otherwise
/// [DeviceCodeSignInState.expired] says so and waits for [newCode]. The
/// polling stops when the screen goes.
final class DeviceCodeSignIn extends Notifier<DeviceCodeSignInState> {
  DeviceCodeSignIn(this.renewExpired);

  final bool renewExpired;
  StreamSubscription<DeviceCodeEvent>? _events;

  @override
  DeviceCodeSignInState build() {
    ref.onDispose(() => unawaited(_events?.cancel()));
    _start();
    return const DeviceCodeSignInState();
  }

  /// Start again with a new code: after one expired, or never came.
  void newCode() {
    state = const DeviceCodeSignInState();
    _start();
  }

  void _start() {
    unawaited(_events?.cancel());
    final session = ref.read(sessionProvider.notifier);
    final device = ref.read(deviceProvider);
    // A server being added, before it's saved, or the one in use.
    _events = deviceCodeSignIn(
      session.signInApi(),
      AppDevice(name: device.name, platform: device.platform),
      renewExpired: renewExpired,
      delay: ref.read(deviceCodeDelayProvider),
    ).listen(_on);
  }

  void _on(DeviceCodeEvent event) {
    switch (event) {
      case DeviceCodeShown(:final code):
        state = DeviceCodeSignInState(code: code);
      case DeviceCodeFailed(:final error, :final fatal):
        state = DeviceCodeSignInState(
          code: fatal ? null : state.code,
          error: error,
        );
      case DeviceCodeAsking():
        break;
      case DeviceCodePolled():
        if (state.error != null) {
          state = DeviceCodeSignInState(code: state.code);
        }
      case DeviceCodeExpired():
        state = const DeviceCodeSignInState(expired: true);
      case DeviceCodeApproved(:final session):
        ref.read(sessionProvider.notifier).signedIn(session);
    }
  }
}

final deviceCodeSignInProvider = NotifierProvider.autoDispose
    .family<DeviceCodeSignIn, DeviceCodeSignInState, bool>(
      DeviceCodeSignIn.new,
    );

/// How the polling waits between polls; a test makes it quick.
final deviceCodeDelayProvider = Provider<Future<void> Function(Duration)>(
  (ref) => Future<void>.delayed,
);

// ---- Servers nearby ----

/// What a search of the local network has found, and whether it's still
/// listening.
final class NearbyServersState {
  const NearbyServersState({required this.found, required this.searching});

  final List<DiscoveredServer> found;
  final bool searching;
}

/// How many scans one search makes: one broadcast can miss a server.
const scansPerSearch = 3;

/// Searches the local network for servers when the screen opens, and again
/// on [search]. Each search asks for local network access first, since
/// Settings can take it back, and finds nothing without it. What's found
/// are hints: connect through [ServerConnect], which checks the server.
final class NearbyServers extends Notifier<NearbyServersState> {
  int _search = 0;

  @override
  NearbyServersState build() {
    ref.onDispose(() => _search++);
    unawaited(Future<void>.microtask(search));
    return const NearbyServersState(found: [], searching: true);
  }

  Future<void> search() async {
    final mine = ++_search;
    state = NearbyServersState(found: state.found, searching: true);
    if (!await mayDiscover(ref.read(localNetworkProvider))) {
      if (mine == _search && ref.mounted) {
        state = NearbyServersState(found: state.found, searching: false);
      }
      return;
    }
    if (mine != _search || !ref.mounted) return;
    // A new search shows what answers now, not what answered before.
    state = const NearbyServersState(found: [], searching: true);
    final discover = ref.read(serverDiscoveryProvider);
    for (var scan = 0; scan < scansPerSearch; scan++) {
      await for (final server in discover()) {
        if (mine != _search || !ref.mounted) return;
        if (state.found.any((known) => known.url == server.url)) continue;
        state = NearbyServersState(
          found: [...state.found, server],
          searching: true,
        );
      }
    }
    if (mine == _search && ref.mounted) {
      state = NearbyServersState(found: state.found, searching: false);
    }
  }
}

final nearbyServersProvider =
    NotifierProvider.autoDispose<NearbyServers, NearbyServersState>(
      NearbyServers.new,
    );

// ---- The saved server didn't answer ----

/// Why the saved server didn't answer, in a line. [canWatchOffline] when the
/// downloads still play.
String unreachableMessage(
  AppLocalizations l,
  Unreachability reason,
  String server, {
  required bool canWatchOffline,
}) {
  final host = server.contains('://') ? server.split('://').last : server;
  return switch (reason) {
    Unreachability.noNetwork =>
      canWatchOffline ? l.unreachableOfflineDownloads : l.unreachableOffline,
    Unreachability.refused => l.unreachableRefused(host),
    Unreachability.notFound => l.unreachableNotFound(host),
    Unreachability.timeout => l.unreachableTimeout(host),
    Unreachability.certificate => l.unreachableCertificate(host),
    Unreachability.other => l.unreachableOther(host),
  };
}
