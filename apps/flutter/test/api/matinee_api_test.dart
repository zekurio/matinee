import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';

void main() {
  final base = Uri.parse('https://matinee.example/movies/');

  test('REST errors expose the server message, HTTP status and data', () async {
    final client = MockClient((request) async {
      expect(request.method, 'GET');
      expect(
        request.url.toString(),
        'https://matinee.example/movies/api/v1/titles/a%2Fb',
      );
      expect(request.headers['authorization'], 'Bearer session-token');
      return http.Response(
        jsonEncode({
          'code': 'NOT_FOUND',
          'status': 404,
          'message': 'That title was removed.',
          'data': {'id': 'a/b'},
        }),
        404,
      );
    });
    addTearDown(client.close);
    final api = MatineeApi(base: base, client: client, token: 'session-token');

    await expectLater(
      api.titles.get('a/b'),
      throwsA(
        isA<ApiException>()
            .having((error) => error.status, 'status', 404)
            .having((error) => error.code, 'code', 'NOT_FOUND')
            .having(
              (error) => error.message,
              'message',
              'That title was removed.',
            )
            .having((error) => error.data, 'data', {'id': 'a/b'}),
      ),
    );
  });

  test('titleItems and looseItems send different JSON bodies', () async {
    final bodies = <Object?>[];
    final client = MockClient((request) async {
      expect(request.method, 'POST');
      expect(request.url.path, '/movies/api/v1/titles/a/items');
      expect(request.headers['content-type'], startsWith('application/json'));
      bodies.add(jsonDecode(request.body));
      return http.Response('[]', 200);
    });
    addTearDown(client.close);
    final api = MatineeApi(base: base, client: client);

    await api.titleItems('a');
    await api.looseItems('a');
    await api.titleItems('a', season: 0);

    expect(bodies, [
      <String, Object?>{},
      {'season': null},
      {'season': 0},
    ]);
  });

  test('SSE reads multiple events across arbitrary UTF-8 chunks', () async {
    final bytes = utf8.encode(
      ': heartbeat\r\n'
      '\r\n'
      'data: {"status":"pending"}\r\n'
      'event: message\r\n'
      '\r\n'
      'event: ignored\n'
      'data: this is not JSON\n'
      '\n'
      'data: {"status":"ready",\n'
      'data: "images":{"key":"vidéo","width":160,"height":90,"columns":5,\n'
      'data: "rows":5,"count":100,"intervalSeconds":10}}\n'
      '\n'
      'event: done\n'
      '\n',
    );
    final client = MockClient.streaming((request, body) async {
      expect(request.method, 'GET');
      expect(request.url.path, '/movies/api/v1/media/a/trickplay');
      expect(request.headers['accept'], 'text/event-stream');
      expect(request.headers['authorization'], 'Bearer session-token');
      return http.StreamedResponse(
        Stream.fromIterable(bytes.map((byte) => [byte])),
        200,
      );
    });
    addTearDown(client.close);
    final api = MatineeApi(base: base, client: client, token: 'session-token');

    final events = await api.media.trickplay('a').toList();

    expect(events, [
      isA<TrickplayStatusPending>(),
      isA<TrickplayStatusReady>().having(
        (event) => event.images.key,
        'key',
        'vidéo',
      ),
    ]);
  });

  test(
    'canceling an event stream aborts a request waiting for headers',
    () async {
      final started = Completer<void>();
      final client = MockClient.streaming((request, body) async {
        started.complete();
        await (request as http.AbortableRequest).abortTrigger;
        throw http.RequestAbortedException(request.url);
      });
      addTearDown(client.close);
      final api = MatineeApi(base: base, client: client);

      final subscription = api.media.trickplay('a').listen((_) {});
      await started.future;
      await subscription.cancel();
    },
  );
}
