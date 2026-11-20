import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../api/matinee_api.dart';
import 'address.dart';
import 'auth_state.dart';
import 'browser_sign_in.dart';
import 'device.dart';
import 'local_network.dart';
import 'network_monitor.dart';
import 'server_http.dart';
import 'session_store.dart';
import 'unreachability.dart';

export 'auth_state.dart';

/// Why connecting to a typed or picked server failed. The screens put it in
/// words; [server] is the address as the app shows it, for the words that
/// name it.
enum ConnectFailureKind {
  /// Nothing usable was typed.
  empty,

  /// Something answered, but not like Matinee.
  notMatinee,

  /// Nothing answered.
  failed,
}

final class ConnectFailure {
  const ConnectFailure(this.kind, [this.server]);

  final ConnectFailureKind kind;
  final String? server;
}

/// Why signing in through the browser failed.
enum SignInFailureKind {
  /// The answer didn't come from this app's request.
  wrongState,

  /// The server said why, in [SignInFailure.serverMessage].
  server,

  /// It failed without anything worth showing.
  generic,
}

final class SignInFailure {
  const SignInFailure(this.kind, [this.serverMessage]);

  final SignInFailureKind kind;

  /// The server's own words, for the screens to translate or show.
  final String? serverMessage;
}

/// A client for one saved server, sending its token, whichever server is in
/// use.
final class ServerClient {
  const ServerClient(this.api, this.client);

  final MatineeApi api;
  final http.Client client;
}

/// A server the person connected to, to sign in to, before it's saved.
final class _Candidate {
  const _Candidate(this.url, this.name, this.api);

  final Uri url;
  final String? name;
  final MatineeApi api;
}

/// How long a server has to answer its sign-out when it's removed.
const signOutTimeout = Duration(seconds: 10);

/// The saved servers, the one in use and the session on it, and the HTTP
/// client every part of the app shares: the API, artwork, and the player.
/// The client adds the session token to requests for the server's origin
/// and nowhere else.
///
/// Each saved server keeps its own token and account, so switching to one
/// still signed in needs no sign-in. A server being added stays apart from
/// the saved ones until it's signed in: the one in use, its clients, and its
/// session are left as they are, so going back returns to it.
final class SessionNotifier extends Notifier<SessionState> {
  late SessionStore _store;
  late http.Client _inner;
  late Device _device;
  late NetworkMonitor _monitor;
  late WebAuthenticator _web;
  late AuthorizedClient _plain;
  late AuthorizedClient _artwork;
  late AuthorizedClient _http;
  MatineeApi? _api;

  Uri? _origin;
  String? _token;
  _Candidate? _candidate;

  /// What showed when adding a server began, to go back to.
  AuthState? _beforeAdding;

  /// Moves whenever [_origin] or [_token] does; clients made before it stop
  /// sending their token.
  int _generation = 0;

  /// Counts the checks [start] sends, so only the latest one sets the state.
  int _check = 0;

  /// The networks as the latest event said.
  NetworkStatus? _network;

  /// A network came up while the latest check was out, so its failure is
  /// stale.
  bool _networkMoved = false;

  bool _alive = true;

  /// Runs as a server is removed, before its session ends: what's on this
  /// device for it goes, sent first where it can be with [MatineeApi], a
  /// client still signed in there, or null when it wasn't.
  Future<void> Function(String origin, MatineeApi? api)? onRemove;

  @override
  SessionState build() {
    _store = ref.watch(sessionStoreProvider);
    _inner = ref.watch(innerHttpClientProvider);
    _device = ref.watch(deviceProvider);
    _monitor = ref.watch(networkMonitorProvider);
    _web = ref.watch(webAuthenticatorProvider);
    _alive = true;
    _generation = 0;
    _check = 0;
    _candidate = null;
    _beforeAdding = null;
    _networkMoved = false;
    _plain = AuthorizedClient(_inner, _device.userAgent);
    _artwork = artworkClient(_inner, _device.userAgent, tokenOf: _store.token);
    _normalizeSaved();
    final active = _store.active;
    _origin = active == null ? null : parseOrigin(active);
    _token = active == null ? null : _store.token(active);
    _makeClients();

    // Try again once a network comes up, rather than wait for a tap.
    final changes = _monitor.changes.listen(_networkChanged);
    ref.onDispose(() {
      _alive = false;
      unawaited(changes.cancel());
    });
    unawaited(_monitor.status().then((status) => _network ??= status));

    return SessionState(
      auth: _begin(const NoServer()),
      servers: _savedServers(),
      activeServer: _store.active,
      removing: const {},
      version: _generation,
    );
  }

  // ---- Clients ----

  /// The client for the session as it is now. Take it again after a sign-in
  /// changes: one kept from before stops working.
  http.Client get httpClient => _http;

  /// Sends each saved server's token to that server, as it is at the time,
  /// for a client made once for the whole run, like the image loader's.
  /// Only for artwork.
  http.Client get artworkHttp => _artwork;

  /// The API of the server in use, with its session, or null while no server
  /// is saved.
  MatineeApi? get api => _api;

  /// The API while signed in. Screens only show then.
  MatineeApi requireApi() => _api ?? (throw StateError('not connected'));

  /// The API of the server being signed in to: one being added, or the one in
  /// use.
  MatineeApi signInApi() => _candidate?.api ?? requireApi();

  /// The session's token as a header, for a player that doesn't go through
  /// [httpClient], like a native one. Only for the server in use.
  Map<String, String> playerHeaders() => switch (_token) {
    final token? => {'Authorization': 'Bearer $token'},
    null => const {},
  };

  /// A client for the saved server [origin], with its token, for work that
  /// belongs to that server whichever is in use, like its downloads. Null
  /// once it's no longer saved.
  ServerClient? serverClient(String origin) {
    if (!_store.servers.any((server) => server.origin == origin)) return null;
    final url = parseOrigin(origin);
    if (url == null) return null;
    final client = followingClient(
      _inner,
      _device.userAgent,
      server: url,
      key: origin,
      tokenOf: _store.token,
    );
    return ServerClient(MatineeApi(base: url, client: client), client);
  }

  void _makeClients() {
    final server = _origin;
    _http = boundClient(
      _inner,
      _device.userAgent,
      server: server,
      bearer: _token,
      made: _generation,
      generation: () => _generation,
    );
    _api = server == null ? null : MatineeApi(base: server, client: _http);
  }

  /// A new server or token: new clients, and the old ones stop.
  void _rebind() {
    _generation++;
    _makeClients();
    _update(version: _generation);
  }

  // ---- State ----

  void _update({
    AuthState? auth,
    List<SavedServer>? servers,
    (String?,)? activeServer,
    Set<String>? removing,
    int? version,
  }) {
    if (!_alive) return;
    state = state.copyWith(
      auth: auth,
      servers: servers,
      activeServer: activeServer,
      removing: removing,
      version: version,
    );
  }

  void _setAuth(AuthState auth) => _update(auth: auth);

  void _publish() =>
      _update(servers: _savedServers(), activeServer: (_store.active,));

  List<SavedServer> _savedServers() {
    final active = _store.active;
    return [
      for (final saved in _store.servers)
        if (parseOrigin(saved.origin) case final url?)
          SavedServer(
            origin: saved.origin,
            address: displayOf(url),
            name: saved.name,
            user: _store.token(saved.origin) != null
                ? decodeUser(saved.user)
                : null,
            active: saved.origin == active,
          ),
    ];
  }

  /// Every saved origin in one form, so the app can look servers up by it,
  /// and the one in use among them. It never drops a session: of two entries
  /// for one server, the one signed in stays, and an origin that doesn't
  /// parse stays as it is.
  void _normalizeSaved() {
    final saved = _store.servers;
    final groups = <String, List<StoredServer>>{};
    for (final server in saved) {
      final url = parseOrigin(server.origin);
      final key = url == null ? server.origin : originKey(url);
      groups
          .putIfAbsent(key, () => [])
          .add(key == server.origin ? server : server.copyWith(origin: key));
    }
    final fixed = [
      for (final same in groups.values)
        same.firstWhere(
          (server) => _store.token(server.origin) != null,
          orElse: () => same.first,
        ),
    ];
    if (fixed.length != saved.length ||
        [for (final server in fixed) server.origin].join() !=
            [for (final server in saved) server.origin].join()) {
      _store.servers = fixed;
    }
    final usable = [
      for (final server in fixed)
        if (parseOrigin(server.origin) != null) server.origin,
    ];
    final active = _store.active;
    final parsed = active == null ? null : parseOrigin(active);
    final fixedActive = parsed != null && usable.contains(originKey(parsed))
        ? originKey(parsed)
        : usable.firstOrNull;
    if (fixedActive != active) _store.active = fixedActive;
  }

  // ---- Network ----

  /// A network the app can use. A check that went out before it may fail
  /// from what came before, so its failure tries again rather than show the
  /// unreachable screen with nothing left to retry it.
  void _networkChanged(NetworkStatus status) {
    final previous = _network;
    _network = status;
    // The same networks again, or none: that's no network coming up.
    if (status == previous || !status.online) return;
    final current = state.auth;
    final checking =
        current is Connecting || (current is Unreachable && current.retrying);
    if (checking) {
      _networkMoved = true;
    } else if (current is Unreachable) {
      start();
    }
  }

  /// The app came to the foreground. A check made while the process ran in
  /// the background, for a download or the player, may have failed only
  /// because Android kept it off the network then.
  void onForeground() {
    final current = state.auth;
    if (current is Unreachable && !current.retrying) start();
  }

  /// Try the saved server again, asking for local network access first
  /// where the system needs it: a saved LAN server is unreachable without
  /// it, which Settings can take back.
  Future<void> retry() =>
      withLocalNetwork(ref.read(localNetworkProvider), start);

  // ---- Checking the saved server ----

  /// Offline mode, as Findroid's: the app shows the downloads and leaves the
  /// server alone. A TV has no downloads, so it's never offline.
  bool get offlineMode => _store.offlineMode && !_device.isTv;

  /// The server last connected to, as `https://media.example.com`, while it
  /// isn't saved, as after removing it: the saved ones are in
  /// [SessionState.servers].
  String? get lastServer {
    final last = parseOrigin(_store.lastServer ?? '');
    if (last == null) return null;
    final key = originKey(last);
    return _store.servers.any((server) => server.origin == key)
        ? null
        : displayOf(last);
  }

  /// The account last signed in to the server in use, while its session
  /// still stands.
  User? get lastUser {
    if (_token == null) return null;
    final key = _store.active;
    if (key == null) return null;
    for (final server in _store.servers) {
      if (server.origin == key) return decodeUser(server.user);
    }
    return null;
  }

  /// Turn offline mode on, straight to the downloads, or off, which checks
  /// the server again. It holds across restarts until it's turned off.
  void setOfflineMode({required bool on}) {
    _store.offlineMode = on && !_device.isTv;
    if (on) {
      _goOffline();
    } else {
      start();
    }
  }

  /// Show the downloads, without the server. [setOfflineMode] keeps it so.
  void _goOffline() {
    if (_device.isTv) return start();
    final server = _origin;
    final user = lastUser;
    if (server == null || user == null) return;
    _setAuth(Offline(displayOf(server), user));
  }

  /// Check the saved server and session again, unless offline mode keeps the
  /// app away from it.
  void start() => _setAuth(_begin(state.auth));

  /// The synchronous part of [start]: the state to show while the check
  /// goes out.
  AuthState _begin(AuthState current) {
    // Any check still out from before no longer sets the state.
    final mine = ++_check;
    _candidate = null;
    _beforeAdding = null;
    final server = _origin;
    final client = _api;
    if (server == null || client == null) return const NoServer();
    final made = _generation;
    final user = lastUser;
    if (offlineMode && user != null) return Offline(displayOf(server), user);
    _networkMoved = false;
    final sent = _token;
    unawaited(
      Future<void>.microtask(() => _verify(mine, made, server, client, sent)),
    );
    // Trying again stays on the unreachable screen, with the button busy.
    return switch (current) {
      Unreachable() => current.withRetrying(true),
      _ => Connecting(displayOf(server)),
    };
  }

  Future<void> _verify(
    int mine,
    int made,
    Uri server,
    MatineeApi client,
    String? sent,
  ) async {
    User? verified;
    try {
      if (sent != null) verified = (await client.auth.session()).user;
    } on Object catch (error) {
      await _checkFailed(mine, made, server, error);
      return;
    }
    // Signed in, out, or to another server meanwhile, or checked again: that
    // stands.
    if (!_alive || _generation != made || mine != _check) return;
    if (verified != null) {
      _cacheUser(verified);
      _setAuth(SignedIn(displayOf(server), verified));
      return;
    }
    // Only a token the server turned down goes. One this device couldn't
    // read stays saved until a sign-in replaces it.
    if (sent != null) _clearToken();
    final cleared = _generation;
    final AuthConfig config;
    try {
      config = await requireApi().auth.config();
    } on Object catch (error) {
      await _checkFailed(mine, cleared, server, error);
      return;
    }
    if (_alive && _generation == cleared && mine == _check) {
      _setAuth(SignedOut(displayOf(server), config));
    }
  }

  /// The check [mine] got no answer: unreachable, unless the network changed
  /// while it was out.
  Future<void> _checkFailed(
    int mine,
    int made,
    Uri server,
    Object error,
  ) async {
    if (!_alive || _generation != made || mine != _check) return;
    final status = await _monitor.status();
    if (!_alive || _generation != made || mine != _check) return;
    if (_networkMoved) {
      start();
    } else {
      _setAuth(
        Unreachable(
          displayOf(server),
          unreachabilityOf(error, hasNetwork: status.online),
        ),
      );
    }
  }

  // ---- Servers ----

  /// Connect to the server the person typed, like `media.example.com` or
  /// `192.168.1.5:8420`, or picked from those found nearby, which tell their
  /// [name]. Without a scheme it tries https, then http. A server already
  /// saved is switched to. Returns why it failed, or null once connected.
  Future<ConnectFailure?> connect(String input, {String? name}) async {
    final picking = state.auth;
    final candidates = serverCandidates(input);
    if (candidates.isEmpty) {
      return const ConnectFailure(ConnectFailureKind.empty);
    }
    for (final url in candidates) {
      final key = originKey(url);
      if (_store.servers.any((server) => server.origin == key)) {
        switchTo(key);
        return null;
      }
    }
    ConnectFailure? failure;
    for (final url in candidates) {
      final client = MatineeApi(base: url, client: _plain);
      try {
        final config = await client.auth.config();
        // Gone back, or to another server, while it answered.
        if (!_alive ||
            !identical(state.auth, picking) ||
            picking is! NoServer) {
          return null;
        }
        if (_origin == null) {
          // The first server is saved at once, so the app comes back to its
          // sign-in.
          _store.servers = [
            ..._store.servers,
            StoredServer(originKey(url), name: name),
          ];
          _activate(url, null);
          _setAuth(SignedOut(displayOf(url), config));
        } else {
          _candidate = _Candidate(url, name, client);
          _setAuth(SignedOut(displayOf(url), config, adding: true));
        }
        return null;
      } on ApiException {
        failure = ConnectFailure(ConnectFailureKind.notMatinee, displayOf(url));
      } on FormatException {
        failure = ConnectFailure(ConnectFailureKind.notMatinee, displayOf(url));
      } on TypeError {
        failure = ConnectFailure(ConnectFailureKind.notMatinee, displayOf(url));
      } on Object {
        failure = ConnectFailure(ConnectFailureKind.failed, displayOf(url));
      }
    }
    return failure;
  }

  /// Pick a server to add, or back from signing in to one being added to
  /// picking again. The server in use stays as it is meanwhile.
  void addServer() {
    _beforeAdding ??= state.auth;
    _candidate = null;
    _setAuth(NoServer(canCancel: _origin != null));
  }

  /// Back from adding a server to the one in use, as it was.
  void cancelAdd() {
    if (_origin == null) return;
    final before = _beforeAdding;
    _candidate = null;
    _beforeAdding = null;
    switch (before) {
      // Its clients and session never changed, so it shows again at once.
      case final SignedIn kept:
        _setAuth(kept);
      case final Offline kept:
        _setAuth(kept);
      default:
        start();
    }
  }

  /// Use the saved server [origin] instead. Still signed in there, it opens
  /// once the server confirms the session; else it asks to sign in.
  void switchTo(String origin) {
    if (!_store.servers.any((server) => server.origin == origin)) return;
    final url = parseOrigin(origin);
    if (url == null) return;
    if (origin == _store.active &&
        _candidate == null &&
        _beforeAdding == null &&
        state.auth is SignedIn) {
      return;
    }
    if (origin != _store.active) _store.offlineMode = false;
    _activate(url, _store.token(origin));
    _setAuth(Connecting(displayOf(url)));
    start();
  }

  /// Forget the saved server [origin]. What's on this device for it goes
  /// first, with what's waiting sent there if it answers, then its session
  /// ends on the server, as far as it answers, and then its token goes.
  /// Removing the one in use moves to the next saved server.
  Future<void> removeServer(String origin) async {
    if (!_store.servers.any((server) => server.origin == origin) ||
        state.removing.contains(origin)) {
      return;
    }
    final url = parseOrigin(origin);
    final bearer = _store.token(origin);
    _update(removing: {...state.removing, origin});
    // Its token stays until the server had its say.
    final client = url != null && bearer != null
        ? MatineeApi(
            base: url,
            client: followingClient(
              _inner,
              _device.userAgent,
              server: url,
              key: origin,
              tokenOf: _store.token,
            ),
          )
        : null;
    try {
      await onRemove?.call(origin, client);
    } on Object {
      // What couldn't be cleaned up must not keep the server.
    }
    if (client != null) {
      try {
        await client.auth.signOut().timeout(signOutTimeout);
      } on Object {
        // The server may be away; the token goes anyway.
      }
    }
    if (!_alive) return;
    _store.removeToken(origin);
    _store.servers = [
      for (final server in _store.servers)
        if (server.origin != origin) server,
    ];
    _update(removing: {...state.removing}..remove(origin));
    if (origin == _store.active) {
      final next = _store.servers.firstOrNull;
      if (next != null) {
        switchTo(next.origin);
      } else {
        _store.offlineMode = false;
        _store.active = null;
        _origin = null;
        _token = null;
        _candidate = null;
        _beforeAdding = null;
        _rebind();
        _setAuth(const NoServer());
      }
    }
    _publish();
  }

  // ---- Signing in ----

  /// Sign in through the browser, to the server being signed in to: one
  /// being added, which is saved and used once it's signed in, or the one in
  /// use. Returns why it failed, or null once signed in or when the person
  /// closed the browser.
  Future<SignInFailure?> signInWithBrowser() async {
    final adding = _candidate;
    final server = adding?.url ?? _origin;
    if (server == null) throw StateError('not connected');
    final signingIn = state.auth;
    bool current() => _alive && identical(state.auth, signingIn);
    final request = BrowserSignIn.create();
    final page = (adding?.api ?? requireApi()).paths.authorize(
      redirectUri: BrowserSignIn.redirectUri,
      state: request.state,
      codeChallenge: request.challenge,
      deviceName: _device.name,
      platform: _device.platform,
    );
    final Uri? back;
    try {
      back = await _web.authenticate(page);
    } on Object {
      return const SignInFailure(SignInFailureKind.generic);
    }
    if (!current() || back == null) return null;
    final code = back.queryParameters['code'];
    if (!BrowserSignIn.isCallback(back) ||
        back.queryParameters['state'] != request.state ||
        code == null) {
      return const SignInFailure(SignInFailureKind.wrongState);
    }
    try {
      final session = await MatineeApi(
        base: server,
        client: _plain,
      ).auth.app.token(code: code, codeVerifier: request.verifier);
      if (current()) _saveSignIn(server, session, adding?.name);
      return null;
    } on ApiException catch (error) {
      // The server's own words when it sent some; the rest of an error's
      // text names sockets and hosts.
      final message = error.message;
      return message == null
          ? const SignInFailure(SignInFailureKind.generic)
          : SignInFailure(SignInFailureKind.server, message);
    } on Object {
      return const SignInFailure(SignInFailureKind.generic);
    }
  }

  /// Signed in with a code, on the server being signed in to.
  void signedIn(AppSession session) {
    final adding = _candidate;
    final server = adding?.url ?? _origin;
    if (server == null) return;
    _saveSignIn(server, session, adding?.name);
  }

  /// Keep [session] as [server]'s, saving the server if it's new, and use
  /// it.
  void _saveSignIn(Uri server, AppSession session, String? name) {
    final key = originKey(server);
    _store.setToken(key, session.token);
    final user = encodeUser(session.user);
    final saved = _store.servers;
    _store.servers = saved.any((entry) => entry.origin == key)
        ? [
            for (final entry in saved)
              if (entry.origin == key)
                entry.copyWith(
                  user: (user,),
                  name: name == null ? null : (name,),
                )
              else
                entry,
          ]
        : [...saved, StoredServer(key, user: user, name: name)];
    if (key != _store.active) _store.offlineMode = false;
    _activate(server, session.token);
    _setAuth(SignedIn(displayOf(server), session.user));
  }

  /// Make the saved [server] the one in use, with [bearer] as its session.
  void _activate(Uri server, String? bearer) {
    final key = originKey(server);
    _store.active = key;
    _store.lastServer = key;
    _origin = server;
    _token = bearer;
    _candidate = null;
    _beforeAdding = null;
    _rebind();
    _publish();
  }

  /// The server changed the account, such as its playback preferences.
  void updateUser(User user) {
    final current = state.auth;
    if (current is! SignedIn) return;
    _cacheUser(user);
    _setAuth(SignedIn(current.server, user));
  }

  void _cacheUser(User user) {
    final key = _store.active;
    if (key == null) return;
    _changeSaved(key, (server) => server.copyWith(user: (encodeUser(user),)));
  }

  /// Sign out of the server in use. The others stay signed in, and it stays
  /// saved.
  Future<void> signOut() async {
    final client = _api;
    final made = _generation;
    try {
      await client?.auth.signOut();
    } on Object {
      // The server may be away; this device signs out anyway.
    }
    // Unless another sign-in came while the server answered.
    if (!_alive || _generation != made) return;
    _clearToken();
    start();
  }

  /// The server in use signed out: its token and account go, it stays saved.
  void _clearToken() {
    // Offline mode needs the account it shows the downloads of.
    _store.offlineMode = false;
    _token = null;
    final key = _store.active;
    if (key != null) {
      _store.removeToken(key);
      _changeSaved(key, (server) => server.copyWith(user: (null,)));
    }
    _rebind();
  }

  void _changeSaved(
    String key,
    StoredServer Function(StoredServer server) change,
  ) {
    _store.servers = [
      for (final server in _store.servers)
        if (server.origin == key) change(server) else server,
    ];
    _publish();
  }
}

// ---- Providers ----

/// The server list and tokens, opened in `main` before the first frame.
final sessionStoreProvider = Provider<SessionStore>(
  (ref) => throw StateError('sessionStoreProvider needs an override'),
);

/// The shared `dart:io` client under every client of the session.
final innerHttpClientProvider = Provider<http.Client>((ref) {
  final client = createInnerClient();
  ref.onDispose(client.close);
  return client;
});

final networkMonitorProvider = Provider<NetworkMonitor>(
  (ref) => const PlatformNetworkMonitor(),
);

final webAuthenticatorProvider = Provider<WebAuthenticator>(
  (ref) => const PlatformWebAuthenticator(),
);

/// The session itself: its state and what changes it. Screens read the
/// narrower providers below.
final sessionProvider = NotifierProvider<SessionNotifier, SessionState>(
  SessionNotifier.new,
);

/// Where the app is between picking a server and using it.
final authStateProvider = Provider<AuthState>(
  (ref) => ref.watch(sessionProvider.select((state) => state.auth)),
);

/// The saved servers, in the order they were added.
final savedServersProvider = Provider<List<SavedServer>>(
  (ref) => ref.watch(sessionProvider.select((state) => state.servers)),
);

/// The origin of the saved server in use, or null while none is saved.
final activeServerProvider = Provider<String?>(
  (ref) => ref.watch(sessionProvider.select((state) => state.activeServer)),
);

/// The servers being removed, while their sessions end.
final removingServersProvider = Provider<Set<String>>(
  (ref) => ref.watch(sessionProvider.select((state) => state.removing)),
);

/// The active server's API, sending its token to its origin only, or null
/// while no server is saved. It's a new one after each sign-in or switch;
/// a client kept from before stops working.
final apiProvider = Provider<MatineeApi?>((ref) {
  ref.watch(sessionProvider.select((state) => state.version));
  return ref.read(sessionProvider.notifier).api;
});

/// The HTTP client for the session as it is now, for requests to the active
/// server that aren't the API's.
final sessionHttpProvider = Provider<http.Client>((ref) {
  ref.watch(sessionProvider.select((state) => state.version));
  return ref.read(sessionProvider.notifier).httpClient;
});

/// Sends each saved server's token to that server, whichever is in use, for
/// artwork.
final artworkHttpProvider = Provider<http.Client>(
  (ref) => ref.read(sessionProvider.notifier).artworkHttp,
);

/// The session token as headers, for a native player that doesn't go
/// through the HTTP client. Only for the active server's URLs.
final playerHeadersProvider = Provider<Map<String, String>>((ref) {
  ref.watch(sessionProvider.select((state) => state.version));
  return ref.read(sessionProvider.notifier).playerHeaders();
});
