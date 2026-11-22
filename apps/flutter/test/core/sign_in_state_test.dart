import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/server_discovery.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/core/sign_in_state.dart';

import 'fakes.dart';

void main() {
  group('connecting', () {
    test('asks for local network access first, whatever the answer', () async {
      final harness = Harness();
      harness.backend.hosts.add('a.example');
      harness.localNetwork
        ..needed = true
        ..answer = false;
      await harness.launch();
      addTearDown(harness.quit);
      final connect = harness.container.listen(
        serverConnectProvider,
        (_, _) {},
      );
      addTearDown(connect.close);

      await harness.container
          .read(serverConnectProvider.notifier)
          .connect('a.example');

      expect(harness.localNetwork.asked, 1);
      // It tried anyway: a server on the internet works without the access.
      expect(harness.auth, isA<SignedOut>());
      expect(harness.container.read(serverConnectProvider).error, isNull);
    });

    test('a second try waits while one is under way', () async {
      final harness = Harness();
      harness.backend.hosts.add('a.example');
      await harness.launch();
      addTearDown(harness.quit);
      final connect = harness.container.listen(
        serverConnectProvider,
        (_, _) {},
      );
      addTearDown(connect.close);
      final notifier = harness.container.read(serverConnectProvider.notifier);

      final first = notifier.connect('a.example');
      expect(harness.container.read(serverConnectProvider).busy, isTrue);
      await notifier.connect('a.example');
      await first;

      expect(
        harness.backend.to('a.example', '/api/v1/auth/config'),
        hasLength(1),
      );
    });
  });

  group('signing in with a code', () {
    test('leaving a candidate discards its pending device grant', () async {
      final harness = Harness();
      final waiting = Completer<void>();
      final poll = Completer<void>();
      harness.backend
        ..hosts.addAll(['a.example', 'b.example'])
        ..devicePolls.add(
          jsonResponse({
            'status': 'approved',
            'token': 'token-b',
            'user': userJson('bob'),
          }),
        );
      await harness.launch(
        overrides: [
          deviceCodeDelayProvider.overrideWithValue((_) {
            waiting.complete();
            return poll.future;
          }),
        ],
      );
      addTearDown(harness.quit);
      await harness.session.connect('a.example');
      harness.session.signedIn(appSession('token-a', 'ada'));
      harness.session.addServer();
      await harness.session.connect('b.example');
      final subscription = harness.container.listen(
        deviceCodeSignInProvider(false),
        (_, _) {},
      );
      addTearDown(subscription.close);
      await waiting.future;
      harness.session.cancelAdd();
      poll.complete();
      await harness.container.pump();
      await Future<void>.delayed(Duration.zero);
      expect((harness.auth as SignedIn).user.username, 'ada');
      expect(
        harness.backend.to('b.example', '/api/v1/auth/device/token'),
        isEmpty,
      );
    });

    test('signs a server being added in, not the one in use', () async {
      final harness = Harness();
      harness.backend
        ..hosts.addAll(['a.example', 'b.example'])
        ..tokens['token-a'] = 'ada'
        ..tokens['token-b'] = 'bob'
        ..devicePolls.add(
          jsonResponse({
            'status': 'approved',
            'token': 'token-b',
            'user': userJson('bob'),
          }),
        );
      await harness.launch(
        overrides: [deviceCodeDelayProvider.overrideWithValue((_) async {})],
      );
      addTearDown(harness.quit);
      await harness.session.connect('a.example');
      await harness.until<SignedOut>();
      harness.session.signedIn(appSession('token-a', 'ada'));
      await harness.until<SignedIn>();
      harness.session.addServer();
      await harness.session.connect('b.example');
      await harness.until<SignedOut>();

      final subscription = harness.container.listen(
        deviceCodeSignInProvider(false),
        (_, _) {},
      );
      addTearDown(subscription.close);

      final signedIn = await harness.until<SignedIn>(
        (state) => state.user.username == 'bob',
      );
      expect(signedIn.server, 'https://b.example');
      expect(harness.backend.to('a.example', '/api/v1/auth/device'), isEmpty);
    });
  });

  group('servers nearby', () {
    Future<NearbyServersState> searched(Harness harness) async {
      final subscription = harness.container.listen(
        nearbyServersProvider,
        (_, _) {},
      );
      addTearDown(subscription.close);
      return harness.untilValue(
        nearbyServersProvider,
        (state) => !state.searching,
      );
    }

    test(
      'leaving discovery cancels the current scan and skips the rest',
      () async {
        final harness = Harness();
        final started = Completer<void>();
        final cancelled = Completer<void>();
        final replies = StreamController<DiscoveredServer>(
          onListen: started.complete,
          onCancel: cancelled.complete,
        );
        var scans = 0;
        await harness.launch(
          overrides: [
            serverDiscoveryProvider.overrideWithValue(() {
              scans++;
              return replies.stream;
            }),
          ],
        );
        addTearDown(harness.quit);
        final subscription = harness.container.listen(
          nearbyServersProvider,
          (_, _) {},
        );
        await started.future;
        subscription.close();
        await harness.container.pump();
        await cancelled.future.timeout(const Duration(seconds: 1));
        await replies.close();
        expect(scans, 1);
      },
    );

    test('collects what answers across the scans, once each', () async {
      final harness = Harness();
      var scans = 0;
      await harness.launch(
        overrides: [
          serverDiscoveryProvider.overrideWithValue(() {
            scans++;
            return Stream.fromIterable([
              const DiscoveredServer('Matinee', 'https://a.example'),
              if (scans == 2)
                const DiscoveredServer('Matinee', 'http://b.example:8420'),
            ]);
          }),
        ],
      );
      addTearDown(harness.quit);

      final state = await searched(harness);

      expect(scans, scansPerSearch);
      expect(state.searching, isFalse);
      expect(state.found.map((server) => server.url), [
        'https://a.example',
        'http://b.example:8420',
      ]);
    });
  });
}
