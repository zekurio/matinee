import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/server_discovery.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/core/sign_in_state.dart';
import 'package:matinee/core/unreachability.dart';
import 'package:matinee/l10n/app_localizations_en.dart';

import 'fakes.dart';

final strings = AppLocalizationsEn();

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

    test('does not ask when the system does not need it', () async {
      final harness = Harness();
      harness.backend.hosts.add('a.example');
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

      expect(harness.localNetwork.asked, 0);
    });

    test('a failure without the access points to where to allow it', () async {
      final harness = Harness();
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
          .connect('192.168.1.5:8420');

      final state = harness.container.read(serverConnectProvider);
      expect(state.busy, isFalse);
      expect(state.error?.kind, ConnectFailureKind.failed);
      expect(state.localNetworkHint, isTrue);
      expect(
        describeConnectFailure(strings, state.error!, localNetworkHint: true),
        endsWith(strings.connectLocalNetwork),
      );

      harness.container.read(serverConnectProvider.notifier).clearError();
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

    test('the failures read in words', () {
      expect(
        describeConnectFailure(
          strings,
          const ConnectFailure(ConnectFailureKind.empty),
        ),
        strings.connectEmpty,
      );
      expect(
        describeConnectFailure(
          strings,
          const ConnectFailure(
            ConnectFailureKind.notMatinee,
            'https://a.example',
          ),
        ),
        strings.connectNotMatinee('https://a.example'),
      );
      expect(
        describeSignInFailure(
          strings,
          const SignInFailure(SignInFailureKind.wrongState),
        ),
        strings.signinWrongState,
      );
      expect(
        describeSignInFailure(
          strings,
          const SignInFailure(SignInFailureKind.server, 'That code ran out.'),
        ),
        'That code ran out.',
      );
      expect(
        describeSignInFailure(
          strings,
          const SignInFailure(SignInFailureKind.generic),
        ),
        strings.signinFailed,
      );
    });

    test(
      'the unreachable messages name the host, and the downloads offline',
      () {
        String say(Unreachability reason, {bool offline = false}) =>
            unreachableMessage(
              strings,
              reason,
              'https://media.example.com',
              canWatchOffline: offline,
            );

        expect(
          say(Unreachability.refused),
          strings.unreachableRefused('media.example.com'),
        );
        expect(
          say(Unreachability.timeout),
          strings.unreachableTimeout('media.example.com'),
        );
        expect(say(Unreachability.noNetwork), strings.unreachableOffline);
        expect(
          say(Unreachability.noNetwork, offline: true),
          strings.unreachableOfflineDownloads,
        );
      },
    );
  });

  group('signing in with a code', () {
    test('shows the code, then signs in once approved', () async {
      final harness = Harness();
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada'
        ..devicePolls.addAll([
          jsonResponse({'status': 'pending'}),
          jsonResponse({
            'status': 'approved',
            'token': 'token-a',
            'user': userJson('ada'),
          }),
        ]);
      await harness.launch(
        overrides: [deviceCodeDelayProvider.overrideWithValue((_) async {})],
      );
      addTearDown(harness.quit);
      await harness.session.connect('a.example');
      await harness.until<SignedOut>();

      final subscription = harness.container.listen(
        deviceCodeSignInProvider(true),
        (_, _) {},
      );
      addTearDown(subscription.close);
      expect(subscription.read().code, isNull);

      await harness.until<SignedIn>();
      expect(subscription.read().expired, isFalse);
      final request = harness.backend
          .to('a.example', '/api/v1/auth/device')
          .single;
      expect(request.body, contains('"platform":"android"'));
    });

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

    test('says so when the code ran out and is not renewed', () async {
      final harness = Harness();
      harness.backend
        ..hosts.add('a.example')
        ..devicePolls.add(
          jsonResponse({
            'code': 'NOT_FOUND',
            'status': 404,
            'message': 'x',
          }, 404),
        );
      await harness.launch(
        overrides: [deviceCodeDelayProvider.overrideWithValue((_) async {})],
      );
      addTearDown(harness.quit);
      await harness.session.connect('a.example');
      await harness.until<SignedOut>();
      final subscription = harness.container.listen(
        deviceCodeSignInProvider(false),
        (_, _) {},
      );
      addTearDown(subscription.close);

      await harness.untilValue(
        deviceCodeSignInProvider(false),
        (state) => state.expired,
      );

      expect(subscription.read().expired, isTrue);
      expect(subscription.read().code, isNull);
      expect(harness.auth, isA<SignedOut>());

      harness.backend.devicePolls.add(
        jsonResponse({'code': 'NOT_FOUND', 'status': 404, 'message': 'x'}, 404),
      );
      harness.container
          .read(deviceCodeSignInProvider(false).notifier)
          .newCode();
      await harness.untilRequests(
        (requests) =>
            requests.where((r) => r.url.path == '/api/v1/auth/device').length >=
            2,
      );
      expect(
        harness.backend.to('a.example', '/api/v1/auth/device'),
        hasLength(2),
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

    test('asks for local network access first and stops without it', () async {
      final harness = Harness();
      var scans = 0;
      harness.localNetwork
        ..needed = true
        ..answer = false;
      await harness.launch(
        overrides: [
          serverDiscoveryProvider.overrideWithValue(() {
            scans++;
            return const Stream.empty();
          }),
        ],
      );
      addTearDown(harness.quit);

      final state = await searched(harness);

      expect(harness.localNetwork.asked, 1);
      expect(scans, 0);
      expect(state.searching, isFalse);
      expect(state.found, isEmpty);
    });

    test(
      'searches once it is allowed, and a new search starts clean',
      () async {
        final harness = Harness();
        harness.localNetwork.needed = true;
        var round = 0;
        await harness.launch(
          overrides: [
            serverDiscoveryProvider.overrideWithValue(() {
              final url = 'https://round-$round.example';
              return Stream.value(DiscoveredServer('Matinee', url));
            }),
          ],
        );
        addTearDown(harness.quit);

        var state = await searched(harness);
        expect(state.found.single.url, 'https://round-0.example');
        expect(harness.localNetwork.asked, 1);

        round = 1;
        await harness.container.read(nearbyServersProvider.notifier).search();
        state = harness.container.read(nearbyServersProvider);

        expect(state.found.single.url, 'https://round-1.example');
        // It's allowed now, so it isn't asked again.
        expect(harness.localNetwork.asked, 1);
      },
    );
  });
}
