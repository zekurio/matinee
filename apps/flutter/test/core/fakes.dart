import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override, ProviderListenable;
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/browser_sign_in.dart';
import 'package:matinee/core/device.dart';
import 'package:matinee/core/local_network.dart';
import 'package:matinee/core/network_monitor.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/core/session_store.dart';

/// Preferences in memory.
final class MemoryPreferences implements Preferences {
  final values = <String, Object>{};

  @override
  String? getString(String key) => values[key] as String?;

  @override
  bool? getBool(String key) => values[key] as bool?;

  @override
  Future<void> setString(String key, String value) async => values[key] = value;

  @override
  Future<void> setBool(String key, {required bool value}) async =>
      values[key] = value;

  @override
  Future<void> remove(String key) async => values.remove(key);
}

/// Secrets in memory; [unreadable] keys throw, as a reset keystore does.
base class MemorySecrets implements SecretStore {
  final values = <String, String>{};
  final unreadable = <String>{};

  @override
  Future<String?> read(String key) async {
    if (unreadable.contains(key)) throw StateError('keystore key is gone');
    return values[key];
  }

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

/// The networks, as a test says they are.
final class FakeNetwork implements NetworkMonitor {
  NetworkStatus current = const NetworkStatus({'wifi'});
  final _changes = StreamController<NetworkStatus>.broadcast();

  @override
  Future<NetworkStatus> status() async => current;

  @override
  Stream<NetworkStatus> get changes => _changes.stream;

  void move(NetworkStatus status) {
    current = status;
    _changes.add(status);
  }
}

/// A browser that answers as the test says.
final class FakeBrowser implements WebAuthenticator {
  /// What the page was opened at, each time.
  final opened = <Uri>[];

  /// The redirect to answer with, from the page's own query.
  Uri? Function(Uri page) answer = (page) => Uri.parse(
    'matinee://auth/callback?code=good&state=${page.queryParameters['state']}',
  );

  @override
  Future<Uri?> authenticate(Uri url) async {
    opened.add(url);
    return answer(url);
  }
}

final class FakeLocalNetwork implements LocalNetworkAccess {
  /// Whether the system wants the access asked for at all.
  bool needed = false;

  /// What the person answers when asked.
  bool answer = true;

  bool granted = false;
  int asked = 0;

  @override
  Future<bool> missing() async => needed && !granted;

  @override
  Future<bool> request() async {
    asked++;
    granted = answer;
    return granted;
  }
}

Map<String, Object?> userJson(String name) => {
  'id': 'id-$name',
  'username': name,
  'displayName': null,
  'role': 'user',
  'avatarId': null,
  'avatarSource': 'none',
  'playback': null,
  'library': {'showSpecials': true},
  'sharing': {'favorites': false, 'stats': false},
};

final configJson = <String, Object?>{
  'setup': null,
  'passkeys': true,
  'passkeySignUp': false,
  'oidc': null,
  'themeAccents': {'light': null, 'dark': null},
  'loginBackdrop': {'enabled': true, 'artwork': 'mixed', 'blur': 0, 'fade': 0},
};

AppSession appSession(String token, String name) =>
    AppSession(token: token, user: User.fromJson(userJson(name)));

http.Response jsonResponse(Object? body, [int status = 200]) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

/// Servers answering as Matinee does, by host, that a test can take down.
final class FakeBackend {
  /// Every request that reached it.
  final requests = <http.Request>[];

  /// Hosts whose requests throw this, as a socket does.
  final down = <String, Object>{};

  /// Hosts that answer, and any other doesn't exist.
  final hosts = <String>{};

  /// Hosts that serve a web page, not Matinee.
  final foreign = <String>{};

  /// Hosts that speak http only: https gets no answer.
  final httpOnly = <String>{};

  /// Which token is whose, by token.
  final tokens = <String, String>{};

  /// The branding's accents each host sends, by host; none by default.
  final accents = <String, Map<String, Object?>>{};

  /// Holds the next `/auth/session` answer until it completes.
  Completer<void>? holdSession;

  /// What the token request answers to this code.
  final codes = <String, AppSession>{};

  /// What each device-code poll answers, in turn.
  final devicePolls = <http.Response>[];
  final backdropTiles = <LoginBackdropTile>[];

  Future<http.Response> handle(http.Request request) async {
    requests.add(request);
    final host = request.url.host;
    final failure = down[host];
    if (failure != null) throw failure;
    if (httpOnly.contains(host) && request.url.scheme == 'https') {
      throw const SocketException('Connection refused');
    }
    if (foreign.contains(host)) {
      return http.Response('<html>Welcome to my blog</html>', 200);
    }
    if (!hosts.contains(host)) {
      throw const SocketException(
        'Failed host lookup',
        osError: OSError('No address associated with hostname', 7),
      );
    }
    final path = request.url.path;
    switch (path) {
      case '/api/v1/auth/login-backdrop':
        return jsonResponse(LoginBackdropTiles(tiles: backdropTiles).toJson());
      case '/api/v1/auth/config':
        return jsonResponse({...configJson, 'themeAccents': ?accents[host]});
      case '/api/v1/auth/session':
        final gate = holdSession;
        if (gate != null) {
          holdSession = null;
          await gate.future;
        }
        final header = request.headers['authorization'];
        final token = header?.replaceFirst('Bearer ', '');
        final name = tokens[token];
        return jsonResponse({'user': name == null ? null : userJson(name)});
      case '/api/v1/auth/sign-out':
        return http.Response('', 200);
      case '/api/v1/auth/device':
        return jsonResponse({
          'deviceCode': 'device-${requests.length}',
          'userCode': 'BCDF-GHJK',
          'verificationUri': 'https://$host/link',
          'verificationUriComplete': 'https://$host/link?code=BCDF-GHJK',
          'expiresIn': 600,
          'interval': 5,
        });
      case '/api/v1/auth/device/token':
        return devicePolls.removeAt(0);
      case '/api/v1/auth/app/token':
        final body = jsonDecode(request.body) as Map<String, Object?>;
        final session = codes[body['code']];
        if (session == null) {
          return jsonResponse({
            'code': 'BAD_REQUEST',
            'status': 400,
            'message': 'That code ran out.',
          }, 400);
        }
        return jsonResponse(session.toJson());
    }
    return http.Response('', 404);
  }

  /// The requests that went to [path] on [host].
  List<http.Request> to(String host, String path) => [
    for (final request in requests)
      if (request.url.host == host && request.url.path == path) request,
  ];
}

/// The app's session over fakes: what a test drives and looks at.
final class Harness {
  Harness({MemoryPreferences? prefs, MemorySecrets? secrets})
    : prefs = prefs ?? MemoryPreferences(),
      secrets = secrets ?? MemorySecrets(),
      backend = FakeBackend(),
      network = FakeNetwork(),
      browser = FakeBrowser(),
      localNetwork = FakeLocalNetwork() {
    client = MockClient(backend.handle);
  }

  final MemoryPreferences prefs;
  final MemorySecrets secrets;
  final FakeBackend backend;
  final FakeNetwork network;
  final FakeBrowser browser;
  final FakeLocalNetwork localNetwork;
  late final http.Client client;
  late SessionStore store;
  late ProviderContainer container;

  /// Opens the store from what's saved and starts the app on it, as a launch
  /// does.
  Future<void> launch({
    Device device = const Device.fallback(),
    List<Override> overrides = const [],
  }) async {
    store = await SessionStore.open(prefs, secrets);
    container = ProviderContainer(
      overrides: [
        sessionStoreProvider.overrideWithValue(store),
        innerHttpClientProvider.overrideWithValue(client),
        networkMonitorProvider.overrideWithValue(network),
        webAuthenticatorProvider.overrideWithValue(browser),
        localNetworkProvider.overrideWithValue(localNetwork),
        deviceProvider.overrideWithValue(device),
        ...overrides,
      ],
    );
    // Keeps the session alive and reading, as the root screen does.
    container.listen(sessionProvider, (_, _) {});
  }

  /// Ends the app, as the system does, keeping what was saved.
  Future<void> quit() async {
    await store.flush();
    container.dispose();
  }

  SessionNotifier get session => container.read(sessionProvider.notifier);

  AuthState get auth => container.read(authStateProvider);

  /// Waits until the auth state is one [test] likes.
  Future<T> until<T extends AuthState>([bool Function(T state)? test]) async {
    bool matches(AuthState state) =>
        state is T && (test == null || test(state));
    if (matches(auth)) return auth as T;
    final done = Completer<T>();
    final subscription = container.listen<AuthState>(authStateProvider, (
      _,
      next,
    ) {
      if (!done.isCompleted && matches(next)) done.complete(next as T);
    });
    try {
      return await done.future.timeout(
        const Duration(seconds: 5),
        onTimeout: () => throw StateError('stuck at $auth'),
      );
    } finally {
      subscription.close();
    }
  }

  /// Waits until [provider] holds a value [test] likes, from what it
  /// notifies rather than from how long it takes. The timeout only ends a
  /// test that would hang.
  Future<T> untilValue<T>(
    ProviderListenable<T> provider,
    bool Function(T value) test,
  ) async {
    final done = Completer<T>();
    final subscription = container.listen<T>(provider, (_, next) {
      if (!done.isCompleted && test(next)) done.complete(next);
    }, fireImmediately: true);
    try {
      return await done.future.timeout(
        const Duration(seconds: 5),
        onTimeout: () => throw StateError('stuck at ${subscription.read()}'),
      );
    } finally {
      subscription.close();
    }
  }

  /// Waits until the fake server has had a request [test] likes, a turn of
  /// the event loop at a time. The timeout only ends a test that would hang.
  Future<void> untilRequests(bool Function(List<http.Request>) test) async {
    final stop = DateTime.now().add(const Duration(seconds: 5));
    while (!test(backend.requests)) {
      if (DateTime.now().isAfter(stop)) {
        throw StateError('never had the request');
      }
      await Future<void>.delayed(Duration.zero);
    }
  }

  /// Lets everything that's waiting go.
  Future<void> settle() async {
    for (var i = 0; i < 20; i++) {
      await Future<void>.delayed(Duration.zero);
    }
    await store.flush();
  }
}
