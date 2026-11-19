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

  test('a list that isn\'t JSON reads as none', () async {
    final prefs = MemoryPreferences();
    prefs.values['servers'] = '{broken';
    final store = await SessionStore.open(prefs, MemorySecrets());

    expect(store.servers, isEmpty);
  });

  test('a token the keystore can\'t give back reads as signed out', () async {
    final prefs = MemoryPreferences();
    final secrets = MemorySecrets();
    prefs.values['servers'] = '[{"origin":"https://a.example/"}]';
    secrets.values['token:https://a.example/'] = 'secret';
    secrets.unreadable.add('token:https://a.example/');

    final store = await SessionStore.open(prefs, secrets);

    expect(store.servers, hasLength(1));
    expect(store.token('https://a.example/'), isNull);
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
