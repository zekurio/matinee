import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/player/playback_relay.dart';

void main() {
  test(
    'forwards ranges and scopes credentials across playlist redirects',
    () async {
      final origin = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final storage = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => origin.close(force: true));
      addTearDown(() => storage.close(force: true));
      final originUrl = Uri.parse(
        'http://127.0.0.1:${origin.port}/hls/main.m3u8?signed=yes',
      );
      final forwarded = <(String, String?)>[];
      origin.listen((request) async {
        forwarded.add((
          request.uri.toString(),
          request.headers.value('authorization'),
        ));
        if (request.uri.path.endsWith('m3u8')) {
          request.response.write('chunk/1.m4s?part=2');
        } else {
          await request.response.redirect(
            Uri.parse('http://127.0.0.1:${storage.port}/segment'),
          );
          return;
        }
        await request.response.close();
      });
      String? storageToken;
      String? storageRange;
      storage.listen((request) async {
        storageToken = request.headers.value('authorization');
        storageRange = request.headers.value('range');
        request.response.statusCode = HttpStatus.partialContent;
        request.response.write('segment');
        await request.response.close();
      });
      final relay = await PlaybackRelay.open(originUrl, {
        'Authorization': 'Bearer test',
      });
      addTearDown(relay.close);
      final url = Uri.parse(relay.url(originUrl.toString()));
      expect(url.query, isEmpty);
      final client = HttpClient();
      addTearDown(() => client.close(force: true));
      final playlist = await (await client.getUrl(url)).close();
      final path = await utf8.decoder.bind(playlist).join();
      final segment = await client.getUrl(url.resolve(path));
      segment.headers.set('range', 'bytes=0-6');
      final bytes = await segment.close();
      expect(bytes.statusCode, HttpStatus.partialContent);
      expect(await utf8.decoder.bind(bytes).join(), 'segment');
      expect(forwarded, [
        ('/hls/main.m3u8?signed=yes', 'Bearer test'),
        ('/hls/chunk/1.m4s?part=2', 'Bearer test'),
      ]);
      expect(storageToken, isNull);
      expect(storageRange, 'bytes=0-6');
    },
  );

  test('serves while the isolate that opened it is busy', () async {
    final bound = ReceivePort();
    final upstream = await Isolate.spawn(_serveFile, bound.sendPort);
    addTearDown(upstream.kill);
    final port = await bound.first;
    final source = 'http://127.0.0.1:$port/media/file.mkv';
    final relay = await PlaybackRelay.open(Uri.parse(source), {
      'Authorization': 'Bearer test',
    });
    addTearDown(relay.close);
    // Asked for at once, before the source can have reached the relay.
    final url = relay.url(source);
    final fetched = Isolate.run(() => _fetch(url));
    // Block this isolate the way a long frame blocks the UI isolate.
    final busy = Stopwatch()..start();
    while (busy.elapsedMilliseconds < 1500) {}
    final done = DateTime.now().millisecondsSinceEpoch;
    final (body, at) = await fetched;
    expect(body, 'Bearer test');
    expect(at, lessThan(done));
  });

  test('stops serving when closed', () async {
    final source = Uri.parse('http://127.0.0.1:9/file.mkv');
    final relay = await PlaybackRelay.open(source, const {});
    final url = Uri.parse(relay.url('$source'));
    relay.close();
    final client = HttpClient();
    addTearDown(() => client.close(force: true));
    await expectLater(() async {
      for (var tries = 0; tries < 50; tries++) {
        await (await client.getUrl(url)).close();
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    }(), throwsA(isA<SocketException>()));
  });
}

/// Answers with the request's credentials, on a separate isolate so the
/// test's busy loop doesn't hold it up.
Future<void> _serveFile(SendPort bound) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((request) async {
    request.response.write(request.headers.value('authorization'));
    await request.response.close();
  });
  bound.send(server.port);
}

Future<(String, int)> _fetch(String url) async {
  final client = HttpClient();
  try {
    final response = await (await client.getUrl(Uri.parse(url))).close();
    final body = await utf8.decoder.bind(response).join();
    return (body, DateTime.now().millisecondsSinceEpoch);
  } finally {
    client.close();
  }
}
