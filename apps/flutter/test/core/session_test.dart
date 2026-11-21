import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/device.dart';
import 'package:matinee/core/network_monitor.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/core/unreachability.dart';

import 'fakes.dart';

const _identify = '/api/v1/account/sessions/current/client';

/// The names [harness]'s session gave [host], in order.
List<Object?> namesSent(Harness harness, String host) => [
  for (final request in harness.backend.to(host, _identify))
    (jsonDecode(request.body) as Map<String, Object?>)['name'],
];

/// A launch with one server saved and signed in: [host] answers, and its
/// token is [token].
Future<Harness> signedInOn(
  String host, {
  String token = 'token-a',
  String name = 'ada',
  Map<String, Object?>? accents,
}) async {
  final harness = Harness();
  harness.backend
    ..hosts.add(host)
    ..tokens[token] = name;
  if (accents != null) harness.backend.accents[host] = accents;
  await harness.launch();
  await harness.until<NoServer>();
  expect(await harness.session.connect(host), isNull);
  await harness.until<SignedOut>();
  harness.session.signedIn(appSession(token, name));
  await harness.until<SignedIn>();
  // The session names itself in the background once it's in; wait for
  // that, so a test counting requests from here doesn't count it.
  await harness.untilRequests(
    (_) => harness.backend.to(host, _identify).isNotEmpty,
  );
  return harness;
}

void main() {
  group('first launch', () {
    test('with no server saved it asks for one', () async {
      final harness = Harness();
      await harness.launch();
      addTearDown(harness.quit);

      expect(harness.auth, isA<NoServer>());
      expect(harness.container.read(savedServersProvider), isEmpty);
      expect(harness.container.read(apiProvider), isNull);
      expect(harness.backend.requests, isEmpty);
    });

    test('a typed address without a scheme tries https first', () async {
      final harness = Harness();
      harness.backend.hosts.add('media.example.com');
      await harness.launch();
      addTearDown(harness.quit);

      expect(await harness.session.connect(' media.example.com/ '), isNull);

      final signedOut = await harness.until<SignedOut>();
      expect(signedOut.server, 'https://media.example.com');
      expect(signedOut.adding, isFalse);
      expect(harness.backend.requests.single.url.scheme, 'https');
    });

    test('falls back to http when https gets no answer', () async {
      final harness = Harness();
      harness.backend
        ..hosts.add('192.168.1.5')
        ..httpOnly.add('192.168.1.5');
      await harness.launch();
      addTearDown(harness.quit);

      expect(await harness.session.connect('192.168.1.5:8420'), isNull);

      final signedOut = await harness.until<SignedOut>();
      expect(signedOut.server, 'http://192.168.1.5:8420');
      expect(
        [for (final request in harness.backend.requests) request.url.scheme],
        ['https', 'http'],
      );
    });

    test('an address nothing usable was typed for is empty', () async {
      final harness = Harness();
      await harness.launch();
      addTearDown(harness.quit);

      final failure = await harness.session.connect('   ');
      expect(failure?.kind, ConnectFailureKind.empty);
      expect(harness.backend.requests, isEmpty);
    });

    test('something that answers but isn\'t Matinee says so', () async {
      final harness = Harness();
      harness.backend
        ..hosts.add('blog.example.com')
        ..foreign.add('blog.example.com');
      await harness.launch();
      addTearDown(harness.quit);

      final failure = await harness.session.connect('blog.example.com');

      expect(failure?.kind, ConnectFailureKind.notMatinee);
      expect(failure?.server, 'http://blog.example.com');
      expect(harness.auth, isA<NoServer>());
    });

    test('a server that doesn\'t exist says it can\'t be reached', () async {
      final harness = Harness();
      await harness.launch();
      addTearDown(harness.quit);

      final failure = await harness.session.connect('ghost.example.com');

      expect(failure?.kind, ConnectFailureKind.failed);
      expect(harness.auth, isA<NoServer>());
    });

    test('the first server is saved at once and signing in keeps it', () async {
      final harness = Harness();
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      await harness.launch();
      addTearDown(harness.quit);

      await harness.session.connect('a.example');
      await harness.until<SignedOut>();
      expect(harness.container.read(savedServersProvider).single.user, isNull);
      expect(harness.container.read(apiProvider), isNotNull);

      harness.session.signedIn(appSession('token-a', 'ada'));
      final signedIn = await harness.until<SignedIn>();
      expect(signedIn.user.username, 'ada');
      final saved = harness.container.read(savedServersProvider).single;
      expect(saved.origin, 'https://a.example/');
      expect(saved.user?.username, 'ada');
      expect(saved.active, isTrue);

      await harness.settle();
      expect(harness.secrets.values['token:https://a.example/'], 'token-a');
    });

    test('signing in through the browser trades the code with PKCE', () async {
      final harness = Harness();
      harness.backend.hosts.add('a.example');
      harness.backend.codes['good'] = appSession('token-a', 'ada');
      await harness.launch();
      addTearDown(harness.quit);
      await harness.session.connect('a.example');
      await harness.until<SignedOut>();

      expect(await harness.session.signInWithBrowser(), isNull);

      final signedIn = await harness.until<SignedIn>();
      expect(signedIn.user.username, 'ada');
      final page = harness.browser.opened.single;
      expect(page.path, '/authorize');
      expect(page.queryParameters['redirect_uri'], 'matinee://auth/callback');
      expect(page.queryParameters['code_challenge_method'], 'S256');
      expect(page.queryParameters['platform'], 'android');
      final exchange = harness.backend.to(
        'a.example',
        '/api/v1/auth/app/token',
      );
      expect(exchange, hasLength(1));
      expect(exchange.single.body, contains('"code":"good"'));
      expect(exchange.single.body, contains('"codeVerifier"'));
    });

    test('a browser callback after leaving sign-in is discarded', () async {
      final harness = Harness();
      harness.backend.hosts.add('a.example');
      await harness.launch();
      addTearDown(harness.quit);
      await harness.session.connect('a.example');
      final pending = harness.session.signInWithBrowser();
      harness.session.addServer();
      await pending;
      expect(harness.auth, isA<NoServer>());
      expect(
        harness.backend.to('a.example', '/api/v1/auth/app/token'),
        isEmpty,
      );
    });

    test('a browser answer for another request is refused', () async {
      final harness = Harness();
      harness.backend.hosts.add('a.example');
      harness.backend.codes['good'] = appSession('token-a', 'ada');
      await harness.launch();
      addTearDown(harness.quit);
      await harness.session.connect('a.example');
      await harness.until<SignedOut>();
      harness.browser.answer = (_) =>
          Uri.parse('matinee://auth/callback?code=good&state=forged');

      final failure = await harness.session.signInWithBrowser();

      expect(failure?.kind, SignInFailureKind.wrongState);
      expect(
        harness.backend.to('a.example', '/api/v1/auth/app/token'),
        isEmpty,
      );
      expect(harness.auth, isA<SignedOut>());
    });

    test('closing the browser, or the server\'s refusal, end quietly or say why', () async {
      final harness = Harness();
      harness.backend.hosts.add('a.example');
      await harness.launch();
      addTearDown(harness.quit);
      await harness.session.connect('a.example');
      await harness.until<SignedOut>();

      harness.browser.answer = (_) => null;
      expect(await harness.session.signInWithBrowser(), isNull);
      expect(harness.auth, isA<SignedOut>());

      harness.browser.answer = (page) => Uri.parse(
        'matinee://auth/callback?code=stale&state=${page.queryParameters['state']}',
      );
      final failure = await harness.session.signInWithBrowser();
      expect(failure?.kind, SignInFailureKind.server);
      expect(failure?.serverMessage, 'That code ran out.');
    });
  });

  group('launching with a saved session', () {
    test('a token the server confirms signs in', () async {
      final first = await signedInOn('a.example');
      await first.quit();

      final again = Harness(prefs: first.prefs, secrets: first.secrets);
      again.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      await again.launch();
      addTearDown(again.quit);

      expect(again.auth, isA<Connecting>());
      final signedIn = await again.until<SignedIn>();
      expect(signedIn.user.username, 'ada');
      expect(
        again.backend.to('a.example', '/api/v1/auth/session').single.headers,
        containsPair('authorization', 'Bearer token-a'),
      );
    });

    test('a token the server turned down is dropped for a sign-in', () async {
      final first = await signedInOn('a.example');
      await first.quit();

      final again = Harness(prefs: first.prefs, secrets: first.secrets);
      again.backend.hosts.add('a.example'); // it knows no token now
      await again.launch();
      addTearDown(again.quit);

      await again.until<SignedOut>();
      await again.settle();
      expect(again.secrets.values, isEmpty);
      final saved = again.container.read(savedServersProvider).single;
      expect(saved.user, isNull);
      expect(saved.active, isTrue);
    });

    test('a token the keystore can\'t give back waits, saved, without a '
        'sign-in', () async {
      final first = await signedInOn('a.example');
      await first.quit();
      first.secrets.unreadable.add('token:https://a.example/');

      final again = Harness(prefs: first.prefs, secrets: first.secrets);
      again.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      await again.launch();
      addTearDown(again.quit);

      final shown = await again.until<Unreachable>();
      expect(shown.reason, Unreachability.unreadableSession);
      await again.settle();
      expect(again.secrets.values['token:https://a.example/'], 'token-a');
      // The server isn't asked, with or without a token.
      expect(again.backend.to('a.example', '/api/v1/auth/session'), isEmpty);
      expect(again.backend.to('a.example', '/api/v1/auth/config'), isEmpty);
      // The account's downloads still play.
      expect(again.session.lastUser?.username, 'ada');

      // Still unreadable on a retry, then the keystore answers.
      await again.session.retry();
      await again.until<Unreachable>((state) => !state.retrying);
      again.secrets.unreadable.clear();
      await again.session.retry();
      final signedIn = await again.until<SignedIn>();
      expect(signedIn.user.username, 'ada');
    });

    test('signing in again leaves the unreadable token until a new one '
        'replaces it', () async {
      final first = await signedInOn('a.example');
      await first.quit();
      first.secrets.unreadable.add('token:https://a.example/');

      final again = Harness(prefs: first.prefs, secrets: first.secrets);
      again.backend
        ..hosts.add('a.example')
        ..tokens['token-b'] = 'ada';
      await again.launch();
      addTearDown(again.quit);
      await again.until<Unreachable>();

      again.session.signInAgain();
      await again.until<SignedOut>();
      await again.settle();
      expect(again.secrets.values['token:https://a.example/'], 'token-a');

      again.session.signedIn(appSession('token-b', 'ada'));
      await again.until<SignedIn>();
      await again.settle();
      expect(again.secrets.values['token:https://a.example/'], 'token-b');
    });

    test('two saved entries for one server keep the signed in one', () async {
      final prefs = MemoryPreferences();
      final secrets = MemorySecrets();
      prefs.values['servers'] = '[{"origin":"HTTPS://A.example:443/x"},{"origin":"https://a.example/","user":null}]';
      secrets.values['token:https://a.example/'] = 'token-a';
      final harness = Harness(prefs: prefs, secrets: secrets);
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      await harness.launch();
      addTearDown(harness.quit);

      expect(harness.container.read(savedServersProvider), hasLength(1));
      expect(
        harness.container.read(activeServerProvider),
        'https://a.example/',
      );
      await harness.until<SignedIn>();
    });
  });

  group('several servers', () {
    test(
      'adding a second server and going back leaves the first as it was',
      () async {
        final harness = await signedInOn('a.example');
        addTearDown(harness.quit);
        harness.backend.hosts.add('b.example');
        final before = harness.backend.requests.length;

        harness.session.addServer();
        expect(
          harness.auth,
          isA<NoServer>().having((s) => s.canCancel, 'canCancel', true),
        );

        await harness.session.connect('b.example');
        final adding = await harness.until<SignedOut>();
        expect(adding.adding, isTrue);
        // Not saved until it's signed in; the one in use stays in use.
        final saved = harness.container.read(savedServersProvider);
        expect(saved.map((server) => server.address), ['https://a.example']);
        expect(
          harness.container.read(activeServerProvider),
          'https://a.example/',
        );

        harness.session.cancelAdd();

        expect(harness.auth, isA<SignedIn>());
        expect((harness.auth as SignedIn).server, 'https://a.example');
        // Its session was never checked again.
        expect(harness.backend.requests.skip(before).map((r) => r.url.path), [
          '/api/v1/auth/config',
        ]);
      },
    );

    test(
      'a server being added signs in with its own token and becomes active',
      () async {
        final harness = await signedInOn('a.example');
        addTearDown(harness.quit);
        harness.backend
          ..hosts.add('b.example')
          ..tokens['token-b'] = 'bob';
        harness.session.addServer();
        await harness.session.connect('b.example', name: 'Basement');
        await harness.until<SignedOut>();

        harness.session.signedIn(appSession('token-b', 'bob'));

        final signedIn = await harness.until<SignedIn>();
        expect(signedIn.server, 'https://b.example');
        final saved = harness.container.read(savedServersProvider);
        expect(saved.map((server) => server.address), [
          'https://a.example',
          'https://b.example',
        ]);
        expect(saved.last.name, 'Basement');
        expect(saved.last.active, isTrue);
        expect(saved.first.user?.username, 'ada');
      },
    );

    test('switching to a signed in server confirms its own session', () async {
      final harness = await signedInOn('a.example');
      addTearDown(harness.quit);
      harness.backend
        ..hosts.add('b.example')
        ..tokens['token-b'] = 'bob';
      harness.session.addServer();
      await harness.session.connect('b.example');
      await harness.until<SignedOut>();
      harness.session.signedIn(appSession('token-b', 'bob'));
      await harness.until<SignedIn>((state) => state.user.username == 'bob');

      harness.session.switchTo('https://a.example/');

      expect(harness.auth, isA<Connecting>());
      final back = await harness.until<SignedIn>(
        (state) => state.user.username == 'ada',
      );
      expect(back.server, 'https://a.example');
      expect(
        harness.container.read(activeServerProvider),
        'https://a.example/',
      );
      final checks = harness.backend.to('a.example', '/api/v1/auth/session');
      expect(checks.last.headers['authorization'], 'Bearer token-a');
    });

    test('connecting to a server that is saved switches to it', () async {
      final harness = await signedInOn('a.example');
      addTearDown(harness.quit);
      harness.backend.hosts.add('b.example');
      harness.session.addServer();
      await harness.session.connect('b.example');
      await harness.until<SignedOut>();
      harness.session.signedIn(appSession('token-b', 'bob'));
      await harness.until<SignedIn>();

      expect(await harness.session.connect('a.example'), isNull);

      expect(
        harness.container.read(activeServerProvider),
        'https://a.example/',
      );
    });

    test(
      'removing the one in use signs it out and moves to the next',
      () async {
        final harness = await signedInOn('a.example');
        addTearDown(harness.quit);
        harness.backend
          ..hosts.add('b.example')
          ..tokens['token-b'] = 'bob';
        harness.session.addServer();
        await harness.session.connect('b.example');
        await harness.until<SignedOut>();
        harness.session.signedIn(appSession('token-b', 'bob'));
        await harness.until<SignedIn>((state) => state.user.username == 'bob');
        final removed = <String>[];
        harness.session.onRemove = (origin, api) async {
          removed.add('$origin ${api != null}');
        };

        await harness.session.removeServer('https://b.example/');

        expect(removed, ['https://b.example/ true']);
        final signOut = harness.backend.to(
          'b.example',
          '/api/v1/auth/sign-out',
        );
        expect(signOut.single.headers['authorization'], 'Bearer token-b');
        await harness.settle();
        expect(harness.secrets.values.keys, ['token:https://a.example/']);
        expect(harness.container.read(removingServersProvider), isEmpty);
        expect(
          harness.container.read(savedServersProvider).map((s) => s.address),
          ['https://a.example'],
        );
        await harness.until<SignedIn>(
          (state) => state.server == 'https://a.example',
        );
      },
    );

    test('removing the last server starts over', () async {
      final harness = await signedInOn('a.example');
      addTearDown(harness.quit);

      await harness.session.removeServer('https://a.example/');

      expect(harness.auth, isA<NoServer>());
      expect(harness.container.read(savedServersProvider), isEmpty);
      expect(harness.container.read(activeServerProvider), isNull);
      expect(harness.container.read(apiProvider), isNull);
      expect(harness.session.lastServer, 'https://a.example');
      await harness.settle();
      expect(harness.secrets.values, isEmpty);
    });

    test('removing a server that is away still forgets it', () async {
      final harness = await signedInOn('a.example');
      addTearDown(harness.quit);
      harness.backend.down['a.example'] = const SocketException('gone');

      await harness.session.removeServer('https://a.example/');

      expect(harness.auth, isA<NoServer>());
      await harness.settle();
      expect(harness.secrets.values, isEmpty);
    });

    test(
      'signing out keeps the server saved and the others signed in',
      () async {
        final harness = await signedInOn('a.example');
        addTearDown(harness.quit);

        await harness.session.signOut();

        await harness.until<SignedOut>();
        final saved = harness.container.read(savedServersProvider).single;
        expect(saved.user, isNull);
        expect(saved.active, isTrue);
        await harness.settle();
        expect(harness.secrets.values, isEmpty);
        expect(harness.session.playerHeaders(), isEmpty);
      },
    );
  });

  group('a server that does not answer', () {
    test('is unreachable, and trying again gets through', () async {
      final harness = await signedInOn('a.example');
      await harness.quit();
      final again = Harness(prefs: harness.prefs, secrets: harness.secrets);
      again.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada'
        ..down['a.example'] = const SocketException(
          'Connection refused',
          osError: OSError('Connection refused', 111),
        );
      await again.launch();
      addTearDown(again.quit);

      final down = await again.until<Unreachable>();
      expect(down.reason, Unreachability.refused);
      expect(down.server, 'https://a.example');
      expect(down.retrying, isFalse);

      again.backend.down.clear();
      final retry = again.session.retry();
      await again.until<SignedIn>();
      await retry;
    });

    test('retry asks for local network access first', () async {
      final harness = await signedInOn('a.example');
      await harness.quit();
      final again = Harness(prefs: harness.prefs, secrets: harness.secrets);
      again.backend
        ..hosts.add('a.example')
        ..down['a.example'] = const SocketException('Connection refused');
      again.localNetwork.needed = true;
      again.localNetwork.granted = false;
      await again.launch();
      addTearDown(again.quit);
      await again.until<Unreachable>();

      await again.session.retry();

      expect(again.localNetwork.asked, 1);
    });

    test('with no network at all says so', () async {
      final harness = await signedInOn('a.example');
      await harness.quit();
      final again = Harness(prefs: harness.prefs, secrets: harness.secrets);
      again.network.current = const NetworkStatus.none();
      again.backend
        ..hosts.add('a.example')
        ..down['a.example'] = const SocketException('Network is unreachable');
      await again.launch();
      addTearDown(again.quit);

      final down = await again.until<Unreachable>();
      expect(down.reason, Unreachability.noNetwork);
    });

    test('tries again by itself once a network comes up', () async {
      final harness = await signedInOn('a.example');
      await harness.quit();
      final again = Harness(prefs: harness.prefs, secrets: harness.secrets);
      again.network.current = const NetworkStatus.none();
      again.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada'
        ..down['a.example'] = const SocketException('Network is unreachable');
      await again.launch();
      addTearDown(again.quit);
      await again.until<Unreachable>();

      again.backend.down.clear();
      again.network.move(const NetworkStatus({'wifi'}));

      await again.until<SignedIn>();
    });

    test(
      'a network that came up during the check retries its failure',
      () async {
        final harness = await signedInOn('a.example');
        await harness.quit();
        final again = Harness(prefs: harness.prefs, secrets: harness.secrets);
        again.network.current = const NetworkStatus.none();
        again.backend
          ..hosts.add('a.example')
          ..tokens['token-a'] = 'ada'
          ..holdSession = Completer<void>();
        final gate = again.backend.holdSession!;
        await again.launch();
        addTearDown(again.quit);
        await again.settle();
        expect(again.auth, isA<Connecting>());

        // The check is out when the network arrives, then it fails from what
        // came before.
        again.network.move(const NetworkStatus({'wifi'}));
        again.backend.down['a.example'] = const SocketException('reset');
        gate.complete();
        await again.settle();
        again.backend.down.clear();

        await again.until<SignedIn>();
      },
    );

    test('coming back to the foreground tries again', () async {
      final harness = await signedInOn('a.example');
      await harness.quit();
      final again = Harness(prefs: harness.prefs, secrets: harness.secrets);
      again.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada'
        ..down['a.example'] = const SocketException('Connection refused');
      await again.launch();
      addTearDown(again.quit);
      await again.until<Unreachable>();

      again.backend.down.clear();
      again.session.onForeground();

      await again.until<SignedIn>();
    });
  });

  group('offline mode', () {
    test('starts with the downloads and leaves the server alone', () async {
      final harness = await signedInOn('a.example');
      harness.session.setOfflineMode(on: true);
      expect(harness.auth, isA<Offline>());
      await harness.quit();

      final again = Harness(prefs: harness.prefs, secrets: harness.secrets);
      again.backend.hosts.add('a.example');
      await again.launch();
      addTearDown(again.quit);

      expect(again.auth, isA<Offline>());
      await again.settle();
      expect(again.backend.requests, isEmpty);

      again.backend.tokens['token-a'] = 'ada';
      again.session.setOfflineMode(on: false);
      await again.until<SignedIn>();
    });
  });

  group('naming the client', () {
    test('signing in tells the server what the app calls itself', () async {
      final harness = await signedInOn('a.example');
      addTearDown(harness.quit);

      final request = harness.backend.to('a.example', _identify).single;
      expect(request.method, 'PUT');
      expect(request.headers['authorization'], 'Bearer token-a');
      expect(namesSent(harness, 'a.example'), ['Matinee Android']);
    });

    test('a TV names itself again each time its session checks out', () async {
      final first = await signedInOn('a.example');
      await first.quit();

      final again = Harness(prefs: first.prefs, secrets: first.secrets);
      again.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      await again.launch(
        device: const Device(
          formFactor: FormFactor.tv,
          name: 'Living room',
          model: 'Chromecast',
          osVersion: '14',
          appVersion: '1.0.0',
          platform: 'androidtv',
        ),
      );
      addTearDown(again.quit);

      await again.until<SignedIn>();
      await again.untilRequests(
        (_) => again.backend.to('a.example', _identify).isNotEmpty,
      );
      expect(namesSent(again, 'a.example'), ['Matinee Android TV']);
    });

    test('a token the server turned down names nothing', () async {
      final first = await signedInOn('a.example');
      await first.quit();

      final again = Harness(prefs: first.prefs, secrets: first.secrets);
      again.backend.hosts.add('a.example');
      await again.launch();
      addTearDown(again.quit);

      await again.until<SignedOut>();
      await again.settle();
      expect(again.backend.to('a.example', _identify), isEmpty);
    });

    test(
      'an older server that doesn\'t know the request stays signed in',
      () async {
        final harness = Harness();
        harness.backend
          ..hosts.add('a.example')
          ..unnamed.add('a.example')
          ..tokens['token-a'] = 'ada';
        await harness.launch();
        addTearDown(harness.quit);
        await harness.session.connect('a.example');
        await harness.until<SignedOut>();

        harness.session.signedIn(appSession('token-a', 'ada'));
        await harness.until<SignedIn>();
        await harness.untilRequests(
          (_) => harness.backend.to('a.example', _identify).isNotEmpty,
        );
        await harness.settle();

        expect(harness.auth, isA<SignedIn>());
      },
    );
  });

  test('each platform has its own client name', () {
    Device on(String platform) => Device(
      formFactor: platform.endsWith('tv') || platform == 'tvos'
          ? FormFactor.tv
          : FormFactor.handset,
      name: 'Device',
      model: 'model',
      osVersion: '1',
      appVersion: '1.0.0',
      platform: platform,
    );
    expect(on('android').clientName, 'Matinee Android');
    expect(on('androidtv').clientName, 'Matinee Android TV');
    expect(on('ios').clientName, 'Matinee iOS');
    expect(on('tvos').clientName, 'Matinee Apple TV');
  });
}
