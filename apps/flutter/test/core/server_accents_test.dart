import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/server_accents.dart';
import 'package:matinee/core/session.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import 'fakes.dart';

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  test('a sign-in screen wears the accent of its own server', () async {
    final harness = Harness();
    harness.backend
      ..hosts.addAll(['a.example', 'b.example'])
      ..tokens['token-a'] = 'ada'
      ..accents['a.example'] = {'light': '#c8102e', 'dark': '#e0234a'}
      ..accents['b.example'] = {'light': '#0b7a4b', 'dark': '#2fbf7f'};
    await harness.launch();
    addTearDown(harness.quit);
    // Kept alive and read, as the app's theme does.
    final shown = harness.container.listen(serverAccentsProvider, (_, _) {});
    await harness.until<NoServer>();
    expect(shown.read(), isNull);

    // The first server's sign-in, before anyone is signed in.
    expect(await harness.session.connect('a.example'), isNull);
    await harness.until<SignedOut>();
    expect(shown.read()?.dark, '#e0234a');
    harness.session.signedIn(appSession('token-a', 'ada'));
    await harness.until<SignedIn>();
    expect(shown.read()?.dark, '#e0234a');

    // A server being added shows its own on its sign-in, not the one in
    // use's and not Matinee's.
    harness.session.addServer();
    expect(await harness.session.connect('b.example'), isNull);
    final adding = await harness.until<SignedOut>();
    expect(adding.adding, isTrue);
    expect(shown.read()?.dark, '#2fbf7f');

    // Going back returns to the accent of the server in use.
    harness.session.cancelAdd();
    await harness.until<SignedIn>();
    await harness.untilValue(
      serverAccentsProvider,
      (accents) => accents?.dark == '#e0234a',
    );
  });
}
