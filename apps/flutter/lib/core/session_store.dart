import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/matinee_api.dart';

/// Where tokens are kept: encrypted at rest, with a key that stays in the
/// platform's keystore. The contract asks apps to keep tokens where the
/// platform keeps secrets.
abstract interface class SecretStore {
  Future<String?> read(String key);

  Future<void> write(String key, String value);

  Future<void> delete(String key);
}

/// [SecretStore] over flutter_secure_storage. A read that fails throws and
/// deletes nothing: the plugin's `resetOnError`, on by default, wipes every
/// secret the app keeps when one can't be decrypted, as after a keystore
/// hiccup on a restored snapshot, which signed the person out for good.
final class PlatformSecretStore implements SecretStore {
  const PlatformSecretStore([
    this._storage = const FlutterSecureStorage(
      aOptions: AndroidOptions(resetOnError: false),
    ),
  ]);

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// Where the server list and the settings next to it are kept.
abstract interface class Preferences {
  String? getString(String key);

  bool? getBool(String key);

  Future<void> setString(String key, String value);

  Future<void> setBool(String key, {required bool value});

  Future<void> remove(String key);
}

/// [Preferences] over shared_preferences, read from memory.
final class PlatformPreferences implements Preferences {
  PlatformPreferences._(this._prefs);

  final SharedPreferencesWithCache _prefs;

  static Future<PlatformPreferences> open() async => PlatformPreferences._(
    await SharedPreferencesWithCache.create(
      cacheOptions: const SharedPreferencesWithCacheOptions(),
    ),
  );

  @override
  String? getString(String key) => _prefs.getString(key);

  @override
  bool? getBool(String key) => _prefs.getBool(key);

  @override
  Future<void> setString(String key, String value) =>
      _prefs.setString(key, value);

  @override
  Future<void> setBool(String key, {required bool value}) =>
      _prefs.setBool(key, value);

  @override
  Future<void> remove(String key) => _prefs.remove(key);
}

/// A server saved on this device. [origin] is the server's root, as
/// `https://media.example.com/`, and names it everywhere else in the app,
/// such as on its downloads. Its token is in the [SecretStore], not here.
@immutable
final class StoredServer {
  const StoredServer(this.origin, {this.user, this.name});

  factory StoredServer.fromJson(Object? json) {
    final fields = json as JsonMap;
    return StoredServer(
      fields['origin'] as String,
      user: fields['user'] as String?,
      name: fields['name'] as String?,
    );
  }

  final String origin;

  /// The account signed in, as JSON, for the server list and for downloads
  /// while the server is away.
  final String? user;

  /// What the server calls itself, when it was found on the local network.
  final String? name;

  StoredServer copyWith({String? origin, (String?,)? user, (String?,)? name}) =>
      StoredServer(
        origin ?? this.origin,
        user: user == null ? this.user : user.$1,
        name: name == null ? this.name : name.$1,
      );

  JsonMap toJson() => {
    'origin': origin,
    if (user != null) 'user': user,
    if (name != null) 'name': name,
  };
}

/// The servers this app knows, which one is in use, and a session token for
/// each. It's read once, when it opens, and answers from memory after; each
/// change is written behind, in order, so a screen never waits on storage.
/// The preferences stay out of backups (res/xml/data_extraction_rules.xml).
final class SessionStore {
  SessionStore._(
    this._prefs,
    this._secrets,
    this._tokens,
    this._servers,
    this._active,
    this._lastServer,
    this._offline,
    this._unreadable,
  );

  /// Reads everything the app saved. A token the keystore can't give back
  /// is [unreadable]: not a token, and not signed out either. It stays
  /// saved, for the next start to read again, until a sign-in replaces it
  /// or the person signs out.
  static Future<SessionStore> open(
    Preferences prefs,
    SecretStore secrets,
  ) async {
    final servers = _decode(prefs.getString(_serversKey));
    final tokens = <String, String>{};
    final unreadable = <String>{};
    Future<void> read(String origin) async {
      try {
        final token = await secrets.read(_tokenKey(origin));
        if (token != null) tokens[origin] = token;
      } on Object {
        unreadable.add(origin);
      }
    }

    // All at once: each is a trip to the keystore, before the first frame.
    await Future.wait([for (final server in servers) read(server.origin)]);
    return SessionStore._(
      prefs,
      secrets,
      tokens,
      servers,
      prefs.getString(_activeKey),
      prefs.getString(_lastServerKey),
      prefs.getBool(_offlineKey) ?? false,
      unreadable,
    );
  }

  static const _serversKey = 'servers';
  static const _activeKey = 'active_server';
  static const _lastServerKey = 'last_server';
  static const _offlineKey = 'offline_mode';

  static String _tokenKey(String origin) => 'token:$origin';

  final Preferences _prefs;
  final SecretStore _secrets;
  final Map<String, String> _tokens;
  List<StoredServer> _servers;
  String? _active;
  String? _lastServer;
  bool _offline;
  final Set<String> _unreadable;
  Future<void> _writes = Future.value();

  /// Writes happen one after another, in the order they were made, and one
  /// that fails doesn't stop the rest.
  void _write(Future<void> Function() write) {
    _writes = _writes.then((_) => write()).onError<Object>((_, _) {});
  }

  /// Completes once every change so far is stored.
  Future<void> flush() => _writes;

  /// The saved servers, in the order they were added. Each entry is read on
  /// its own, so one this app can't read any more doesn't lose the others.
  List<StoredServer> get servers => _servers;

  set servers(List<StoredServer> value) {
    _servers = List.unmodifiable(value);
    final text = jsonEncode([for (final server in value) server.toJson()]);
    _write(() => _prefs.setString(_serversKey, text));
  }

  static List<StoredServer> _decode(String? text) {
    if (text == null) return const [];
    final Object? entries;
    try {
      entries = jsonDecode(text);
    } on FormatException {
      return const [];
    }
    if (entries is! List<Object?>) return const [];
    return [
      for (final entry in entries)
        ?_tryRead(() => StoredServer.fromJson(entry)),
    ];
  }

  /// The session token of the saved server [origin], while signed in.
  String? token(String origin) => _tokens[origin];

  void setToken(String origin, String token) {
    _tokens[origin] = token;
    _unreadable.remove(origin);
    _write(() => _secrets.write(_tokenKey(origin), token));
  }

  void removeToken(String origin) {
    _tokens.remove(origin);
    _unreadable.remove(origin);
    _write(() => _secrets.delete(_tokenKey(origin)));
  }

  /// Whether [origin] has a token saved that the keystore wouldn't give
  /// back when it was read.
  bool unreadable(String origin) => _unreadable.contains(origin);

  /// Asks the keystore for [origin]'s token again, after it failed: the
  /// token once it reads, else null, and it stays unreadable.
  Future<String?> readAgain(String origin) async {
    if (!_unreadable.contains(origin)) return _tokens[origin];
    // After the writes made so far, so a sign-in meanwhile isn't undone.
    await _writes;
    if (!_unreadable.contains(origin)) return _tokens[origin];
    try {
      final token = await _secrets.read(_tokenKey(origin));
      _unreadable.remove(origin);
      if (token != null) _tokens[origin] = token;
      return token;
    } on Object {
      return null;
    }
  }

  /// The person chose to sign in again rather than wait for the keystore:
  /// [origin] reads as signed out for the rest of this run. The saved token
  /// stays until the sign-in replaces it, so leaving before then still has
  /// the next start try it.
  void giveUpOn(String origin) => _unreadable.remove(origin);

  /// The origin of the server in use, one of [servers].
  String? get active => _active;

  set active(String? value) {
    _active = value;
    _write(
      () => value == null
          ? _prefs.remove(_activeKey)
          : _prefs.setString(_activeKey, value),
    );
  }

  /// The last server connected to, kept after switching away or removing it,
  /// for a TV to offer again.
  String? get lastServer => _lastServer;

  set lastServer(String? value) {
    _lastServer = value;
    _write(
      () => value == null
          ? _prefs.remove(_lastServerKey)
          : _prefs.setString(_lastServerKey, value),
    );
  }

  /// Offline mode, as Findroid's: start with the downloads and leave the
  /// server alone until it's off.
  bool get offlineMode => _offline;

  set offlineMode(bool value) {
    _offline = value;
    _write(() => _prefs.setBool(_offlineKey, value: value));
  }
}

T? _tryRead<T>(T Function() read) {
  try {
    return read();
  } on Object {
    return null;
  }
}

/// A saved account, as the server list keeps it; null when it can't be read.
User? decodeUser(String? text) {
  if (text == null) return null;
  return _tryRead(() => _savedUser(jsonDecode(text)));
}

/// A user saved before accounts had permissions lacks the list. Offline
/// start, the server list, and the downloads need the user, so it reads
/// with none, which offers nothing past what every account may, and the
/// session saves the real ones once the server answers. Dropping it would
/// leave the server looking signed out while its token stands, as iOS's
/// `StoredServer.savedUser` has it.
User _savedUser(Object? json) {
  try {
    return User.fromJson(json);
  } on Object {
    if (json is! JsonMap || json.containsKey('permissions')) rethrow;
    return User.fromJson({...json, 'permissions': const <String>[]});
  }
}

String encodeUser(User user) => jsonEncode(user.toJson());
