import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/core/server_http.dart';
import 'package:matinee/core/session.dart';

import 'fakes.dart';

const agent = 'Matinee/1 (test)';

/// A shared client that records what it was sent.
final class Wire {
  final sent = <http.BaseRequest>[];

  late final client = MockClient((request) async {
    sent.add(request);
    return http.Response('{}', 200);
  });

  Future<Map<String, String>> get(http.Client through, String url) async {
    await through.get(Uri.parse(url));
    return sent.last.headers;
  }
}

void main() {
  group('a client bound to a sign-in', () {
    test('sends the token to its own origin only', () async {
      final wire = Wire();
      final client = boundClient(
        wire.client,
        agent,
        server: Uri.parse('https://a.example/'),
        bearer: 'secret',
        made: 0,
        generation: () => 0,
      );

      final own = await wire.get(client, 'https://a.example/api/v1/titles');
      expect(own['authorization'], 'Bearer secret');
      expect(own['user-agent'], agent);

      for (final other in [
        'https://b.example/api/v1/titles',
        'https://a.example.evil.com/',
        'http://a.example/api/v1/titles',
        'https://a.example:8443/api/v1/titles',
      ]) {
        final headers = await wire.get(client, other);
        expect(headers.containsKey('authorization'), isFalse, reason: other);
        expect(headers['user-agent'], agent, reason: other);
      }
    });

    test('drops an authorization someone else put on a request', () async {
      final wire = Wire();
      final client = boundClient(
        wire.client,
        agent,
        server: Uri.parse('https://a.example/'),
        bearer: 'secret',
        made: 0,
        generation: () => 0,
      );

      await client.get(
        Uri.parse('https://b.example/'),
        headers: {'Authorization': 'Bearer stolen'},
      );

      expect(wire.sent.last.headers.containsKey('authorization'), isFalse);
    });

    test(
      'refuses once the generation moved, rather than send a later token',
      () async {
        final wire = Wire();
        var generation = 0;
        final client = boundClient(
          wire.client,
          agent,
          server: Uri.parse('https://a.example/'),
          bearer: 'secret',
          made: 0,
          generation: () => generation,
        );
        await client.get(Uri.parse('https://a.example/'));
        expect(wire.sent, hasLength(1));

        generation = 1;

        await expectLater(
          client.get(Uri.parse('https://a.example/')),
          throwsA(isA<SessionChanged>()),
        );
        await expectLater(
          client.get(Uri.parse('https://b.example/')),
          throwsA(isA<SessionChanged>()),
        );
        expect(wire.sent, hasLength(1), reason: 'nothing reached the network');
      },
    );
  });

  group('a client that follows a saved server', () {
    test('sends the token the server has when each request goes', () async {
      final wire = Wire();
      final tokens = <String, String>{'https://a.example/': 'one'};
      final client = followingClient(
        wire.client,
        agent,
        server: Uri.parse('https://a.example/'),
        key: 'https://a.example/',
        tokenOf: (origin) => tokens[origin],
      );

      expect(
        (await wire.get(client, 'https://a.example/x'))['authorization'],
        'Bearer one',
      );
      tokens['https://a.example/'] = 'two';
      expect(
        (await wire.get(client, 'https://a.example/x'))['authorization'],
        'Bearer two',
      );
      tokens.clear();
      expect(
        (await wire.get(
          client,
          'https://a.example/x',
        )).containsKey('authorization'),
        isFalse,
      );
      tokens['https://a.example/'] = 'three';
      expect(
        (await wire.get(
          client,
          'https://b.example/x',
        )).containsKey('authorization'),
        isFalse,
      );
    });
  });

  group('the artwork client', () {
    test('sends each saved server its own token and no one else any', () async {
      final wire = Wire();
      final tokens = <String, String>{
        'https://a.example/': 'for-a',
        'https://b.example/': 'for-b',
      };
      final client = artworkClient(
        wire.client,
        agent,
        tokenOf: (origin) => tokens[origin],
      );

      expect(
        (await wire.get(
          client,
          'https://a.example/api/artwork/1',
        ))['authorization'],
        'Bearer for-a',
      );
      expect(
        (await wire.get(
          client,
          'https://b.example/api/artwork/1',
        ))['authorization'],
        'Bearer for-b',
      );
      expect(
        (await wire.get(
          client,
          'https://c.example/api/artwork/1',
        )).containsKey('authorization'),
        isFalse,
      );
      expect(
        (await wire.get(
          client,
          'http://a.example/api/artwork/1',
        )).containsKey('authorization'),
        isFalse,
      );
    });
  });

  group('through the session', () {
    test('a client kept from before a sign-in ended stops, and the new one '
        'sends the new token', () async {
      final harness = Harness();
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-1'] = 'ada'
        ..tokens['token-2'] = 'ada';
      await harness.launch();
      addTearDown(harness.quit);
      await harness.session.connect('a.example');
      await harness.until<SignedOut>();
      harness.session.signedIn(appSession('token-1', 'ada'));
      await harness.until<SignedIn>();
      final kept = harness.container.read(sessionHttpProvider);
      final keptApi = harness.container.read(apiProvider)!;
      final before = harness.container.read(sessionProvider).version;

      await harness.session.signOut();
      await harness.until<SignedOut>();
      harness.session.signedIn(appSession('token-2', 'ada'));
      await harness.until<SignedIn>();

      expect(
        harness.container.read(sessionProvider).version,
        greaterThan(before),
      );
      await expectLater(
        kept.get(Uri.parse('https://a.example/x')),
        throwsA(isA<SessionChanged>()),
      );
      await expectLater(
        keptApi.titleItems('x'),
        throwsA(isA<SessionChanged>()),
      );
      expect(harness.backend.to('a.example', '/x'), isEmpty);
      final fresh = harness.container.read(sessionHttpProvider);
      await fresh.get(Uri.parse('https://a.example/x'));
      expect(
        harness.backend.to('a.example', '/x').single.headers['authorization'],
        'Bearer token-2',
      );
    });

    test('a client kept from the server before a switch stops', () async {
      final harness = Harness();
      harness.backend
        ..hosts.addAll(['a.example', 'b.example'])
        ..tokens['token-a'] = 'ada'
        ..tokens['token-b'] = 'bob';
      await harness.launch();
      addTearDown(harness.quit);
      await harness.session.connect('a.example');
      await harness.until<SignedOut>();
      harness.session.signedIn(appSession('token-a', 'ada'));
      await harness.until<SignedIn>();
      final kept = harness.container.read(sessionHttpProvider);
      harness.session.addServer();
      await harness.session.connect('b.example');
      await harness.until<SignedOut>();
      // Adding leaves the one in use, and its clients, alone.
      await kept.get(Uri.parse('https://a.example/still'));
      harness.session.signedIn(appSession('token-b', 'bob'));
      await harness.until<SignedIn>();

      await expectLater(
        kept.get(Uri.parse('https://a.example/x')),
        throwsA(isA<SessionChanged>()),
      );
      expect(harness.session.playerHeaders(), {
        'Authorization': 'Bearer token-b',
      });
    });
  });
}
