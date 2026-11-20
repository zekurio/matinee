import 'dart:convert';
import 'dart:io';

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
}
