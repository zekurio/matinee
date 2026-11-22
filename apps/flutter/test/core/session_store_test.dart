import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_secure_storage_platform_interface/flutter_secure_storage_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/session_store.dart';

import 'fakes.dart';

void main() {
  test('what is saved comes back, with tokens from the secret store', () async {
    final prefs = MemoryPreferences();
    final secrets = MemorySecrets();
    final store = await SessionStore.open(prefs, secrets);
    store.servers = const [
      StoredServer('https://a.example/', name: 'Den'),
      StoredServer('http://192.168.1.5:8420/'),
    ];
    store.setToken('https://a.example/', 'secret');
    store.active = 'https://a.example/';
    store.lastServer = 'https://a.example/';
    store.offlineMode = true;
    await store.flush();

    final again = await SessionStore.open(prefs, secrets);

    expect(again.servers.map((server) => server.origin), [
      'https://a.example/',
      'http://192.168.1.5:8420/',
    ]);
    expect(again.servers.first.name, 'Den');
    expect(again.token('https://a.example/'), 'secret');
    expect(again.token('http://192.168.1.5:8420/'), isNull);
    expect(again.active, 'https://a.example/');
    expect(again.lastServer, 'https://a.example/');
    expect(again.offlineMode, isTrue);
  });

  test('the token is in the secret store and not in the preferences', () async {
    final prefs = MemoryPreferences();
    final secrets = MemorySecrets();
    final store = await SessionStore.open(prefs, secrets);
    store.servers = const [StoredServer('https://a.example/')];
    store.setToken('https://a.example/', 'secret');
    await store.flush();

    expect(secrets.values.values, ['secret']);
    expect(prefs.values.values.join(), isNot(contains('secret')));
  });

  test('removing a token or clearing a setting is stored too', () async {
    final prefs = MemoryPreferences();
    final secrets = MemorySecrets();
    final store = await SessionStore.open(prefs, secrets);
    store.setToken('https://a.example/', 'secret');
    store.active = 'https://a.example/';
    store.removeToken('https://a.example/');
    store.active = null;
    await store.flush();

    expect(secrets.values, isEmpty);
    expect(prefs.values.containsKey('active_server'), isFalse);
    expect(store.token('https://a.example/'), isNull);
  });

  test('an entry that can\'t be read doesn\'t lose the others', () async {
    final prefs = MemoryPreferences();
    prefs.values['servers'] = '[{"origin":"https://a.example/"},{"nope":1},"text",{"origin":"https://b.example/","name":"B"}]';
    final store = await SessionStore.open(prefs, MemorySecrets());

    expect(store.servers.map((server) => server.origin), [
      'https://a.example/',
      'https://b.example/',
    ]);
  });

  group('a saved user', () {
    test('from before permissions reads with none', () {
      final old = {...userJson('ada')}..remove('permissions');
      final user = decodeUser(jsonEncode(old));

      expect(user?.username, 'ada');
      expect(user?.permissions, isEmpty);
    });

    test('keeps the permissions it was saved with', () {
      final user = decodeUser(
        jsonEncode({
          ...userJson('ada'),
          'permissions': ['all'],
        }),
      );

      expect(user?.permissions, ['all']);
    });

    test('that lacks anything else still reads as none', () {
      final broken = {...userJson('ada')}
        ..remove('permissions')
        ..remove('username');

      expect(decodeUser(jsonEncode(broken)), isNull);
      expect(decodeUser('{broken'), isNull);
      expect(decodeUser('"ada"'), isNull);
    });
  });

  test('a list that isn\'t JSON reads as none', () async {
    final prefs = MemoryPreferences();
    prefs.values['servers'] = '{broken';
    final store = await SessionStore.open(prefs, MemorySecrets());

    expect(store.servers, isEmpty);
  });

  test(
    'a token the keystore can\'t give back is unreadable, and kept',
    () async {
      final prefs = MemoryPreferences();
      final secrets = MemorySecrets();
      prefs.values['servers'] = '[{"origin":"https://a.example/"}]';
      secrets.values['token:https://a.example/'] = 'secret';
      secrets.unreadable.add('token:https://a.example/');

      final store = await SessionStore.open(prefs, secrets);

      expect(store.servers, hasLength(1));
      expect(store.token('https://a.example/'), isNull);
      expect(store.unreadable('https://a.example/'), isTrue);
      expect(await store.readAgain('https://a.example/'), isNull);
      expect(store.unreadable('https://a.example/'), isTrue);
      expect(secrets.values['token:https://a.example/'], 'secret');

      // The keystore comes back.
      secrets.unreadable.clear();
      expect(await store.readAgain('https://a.example/'), 'secret');
      expect(store.token('https://a.example/'), 'secret');
      expect(store.unreadable('https://a.example/'), isFalse);
    },
  );

  group('PlatformSecretStore', () {
    late _ThrowingPlatform platform;
    setUp(() {
      platform = _ThrowingPlatform();
      FlutterSecureStoragePlatform.instance = platform;
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
    });
    tearDown(() => debugDefaultTargetPlatformOverride = null);

    test('a read that fails deletes nothing', () async {
      platform.values['token:https://a.example/'] = 'secret';
      final prefs = MemoryPreferences()
        ..values['servers'] = '[{"origin":"https://a.example/"}]';

      final store = await SessionStore.open(prefs, const PlatformSecretStore());

      expect(store.unreadable('https://a.example/'), isTrue);
      // The plugin is told not to wipe what it can't decrypt, and nothing
      // here deletes it either.
      expect(platform.options.last['resetOnError'], 'false');
      expect(platform.deleted, isEmpty);
      expect(platform.values['token:https://a.example/'], 'secret');
    });
  });

  test('a write that fails does not stop the ones after it', () async {
    final prefs = MemoryPreferences();
    final secrets = _FailingSecrets();
    final store = await SessionStore.open(prefs, secrets);

    store.setToken('https://a.example/', 'secret');
    store.active = 'https://a.example/';
    await store.flush();

    expect(prefs.values['active_server'], 'https://a.example/');
    expect(
      store.token('https://a.example/'),
      'secret',
      reason: 'kept for this run',
    );
  });
}

final class _FailingSecrets extends MemorySecrets {
  @override
  Future<void> write(String key, String value) async =>
      throw StateError('keystore is locked');
}

/// flutter_secure_storage's native side when the keystore won't decrypt: a
/// read throws, and only an explicit delete removes anything.
final class _ThrowingPlatform extends FlutterSecureStoragePlatform {
  final values = <String, String>{};
  final deleted = <String>[];
  final options = <Map<String, String>>[];

  @override
  Future<String?> read({
    required String key,
    required Map<String, String> options,
  }) async {
    this.options.add(options);
    throw PlatformException(code: 'Exception', message: 'BadPaddingException');
  }

  @override
  Future<void> write({
    required String key,
    required String value,
    required Map<String, String> options,
  }) async => values[key] = value;

  @override
  Future<bool> containsKey({
    required String key,
    required Map<String, String> options,
  }) async => values.containsKey(key);

  @override
  Future<void> delete({
    required String key,
    required Map<String, String> options,
  }) async {
    deleted.add(key);
    values.remove(key);
  }

  @override
  Future<Map<String, String>> readAll({
    required Map<String, String> options,
  }) async => throw PlatformException(code: 'Exception');

  @override
  Future<void> deleteAll({required Map<String, String> options}) async {
    deleted.add('*');
    values.clear();
  }
}
