import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/server_accents.dart';
import 'package:matinee/core/session.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import 'fakes.dart';
import 'session_test.dart' show signedInOn;

const _rose = {'light': '#be123c', 'dark': '#f43f5e'};

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  test('follows the accents of the server in use', () async {
    final harness = await signedInOn('a.example', accents: _rose);
    addTearDown(harness.quit);
    final accents = await harness.untilValue(
      serverAccentsProvider,
      (accents) => accents?.dark != null,
    );
    expect(accents!.light, '#be123c');
    expect(accents.dark, '#f43f5e');
  });

  test('a server without accents leaves the preset, after a switch', () async {
    final harness = await signedInOn('a.example', accents: _rose);
    addTearDown(harness.quit);
    await harness.untilValue(
      serverAccentsProvider,
      (accents) => accents?.dark != null,
    );
    harness.backend
      ..hosts.add('b.example')
      ..tokens['token-b'] = 'bob';
    harness.session.addServer();
    await harness.session.connect('b.example');
    await harness.until<SignedOut>();
    harness.session.signedIn(appSession('token-b', 'bob'));
    await harness.until<SignedIn>((state) => state.user.username == 'bob');
    final none = await harness.untilValue(
      serverAccentsProvider,
      (accents) => accents?.dark == null,
    );
    expect(none?.light, isNull);
    // And back again.
    harness.session.switchTo('https://a.example/');
    await harness.until<SignedIn>((state) => state.user.username == 'ada');
    await harness.untilValue(
      serverAccentsProvider,
      (accents) => accents?.dark == '#f43f5e',
    );
  });

  test('keeps the last known accents while the server is away', () async {
    final first = await signedInOn('a.example', accents: _rose);
    await first.untilValue(
      serverAccentsProvider,
      (accents) => accents?.dark != null,
    );
    // Let the answer reach the device's storage.
    await Future<void>.delayed(Duration.zero);
    await first.quit();

    final again = Harness(prefs: first.prefs, secrets: first.secrets);
    again.backend.down['a.example'] = const SocketException('gone');
    await again.launch();
    addTearDown(again.quit);
    final kept = await again.untilValue(
      serverAccentsProvider,
      (accents) => accents?.dark != null,
    );
    expect(kept!.dark, '#f43f5e');
  });
}
