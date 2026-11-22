import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/network_monitor.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/core/unreachability.dart';

import 'fakes.dart';

const _identify = '/api/v1/account/sessions/current/client';

/// A launch with one server saved and signed in: [host] answers, and its
/// token is [token].
Future<Harness> signedInOn(
  String host, {
  String token = 'token-a',
  String name = 'ada',
}) async {
  final harness = Harness();
  harness.backend
    ..hosts.add(host)
    ..tokens[token] = name;
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
  });

  group('launching with a saved session', () {
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
  });

  group('a server that does not answer', () {
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

  group('a user saved before permissions', () {
    /// [harness]'s saved servers with each user's permissions taken out,
    /// as an app from before them saved the user.
    void forgetPermissions(Harness harness) {
      final servers = [
        for (final server in jsonDecode(
          harness.prefs.values['servers']! as String,
        ) as List<Object?>)
          if (server case {'user': final String user})
            {
              // SAFETY: the store wrote each server as a JSON object.
              ...server as Map<String, Object?>,
              'user': jsonEncode(
                // SAFETY: and its user as one.
                {...jsonDecode(user) as Map<String, Object?>}
                  ..remove('permissions'),
              ),
            }
          else
            server,
      ];
      harness.prefs.values['servers'] = jsonEncode(servers);
    }

    test('still starts offline with the downloads', () async {
      final first = await signedInOn('a.example');
      first.session.setOfflineMode(on: true);
      await first.quit();
      forgetPermissions(first);

      final again = Harness(prefs: first.prefs, secrets: first.secrets);
      again.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      await again.launch();
      addTearDown(again.quit);

      final offline = again.auth;
      expect(offline, isA<Offline>());
      expect((offline as Offline).user.username, 'ada');
      expect(offline.user.permissions, isEmpty);
      expect(again.container.read(savedServersProvider).single.user, isNotNull);

      again.session.setOfflineMode(on: false);
      await again.until<SignedIn>();
    });

    test('stays signed in, and the server\'s answer is saved', () async {
      final first = await signedInOn('a.example');
      await first.quit();
      forgetPermissions(first);

      final again = Harness(prefs: first.prefs, secrets: first.secrets);
      again.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      await again.launch();
      addTearDown(again.quit);

      // While the check is out, the server list still has the account.
      expect(again.container.read(savedServersProvider).single.user, isNotNull);
      final signedIn = await again.until<SignedIn>();
      expect(signedIn.user.username, 'ada');
      await again.settle();
      final saved = jsonDecode(again.prefs.values['servers']! as String);
      expect(saved, [containsPair('user', contains('"permissions":[]'))]);
    });
  });

  group('naming the client', () {
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
}
