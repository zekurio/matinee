import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/media/artwork.dart';
import 'package:matinee/media/blurhash.dart';

final class MemoryCache implements ArtworkCache {
  final files = <Uri, Uint8List>{};

  @override
  Future<Uint8List?> read(Uri url) async => files[url];

  @override
  Future<void> write(Uri url, Uint8List bytes) async => files[url] = bytes;
}

void main() {
  final paths = Paths(Uri(scheme: 'https', host: 'media.example.com'));

  test('the loader keeps what it fetched and fetches it once', () async {
    var fetched = 0;
    final client = MockClient((request) async {
      fetched++;
      return http.Response.bytes([1, 2, 3], 200);
    });
    final cache = MemoryCache();
    final loader = ArtworkLoader(client, cache);
    final url = paths.artwork('a1');
    expect(await loader.load(url), [1, 2, 3]);
    await pumpEventQueue();
    expect(cache.files[url], [1, 2, 3]);
    expect(await loader.load(url), [1, 2, 3]);
    expect(fetched, 1);
  });

  test('missing artwork fails and is not kept', () async {
    final cache = MemoryCache();
    final loader = ArtworkLoader(
      MockClient((request) async => http.Response('', 404)),
      cache,
    );
    await expectLater(
      loader.load(paths.artwork('gone')),
      throwsA(isA<ArtworkUnavailable>()),
    );
    expect(cache.files, isEmpty);
  });

  test('a blurhash decodes to its colors, and junk to nothing', () {
    final pixels = decodeBlurHash('LEHV6nWB2yk8pyo0adR*.7kCMdnj', 4, 3);
    expect(pixels, isNotNull);
    expect(pixels!.length, 4 * 3 * 4);
    expect(pixels[3], 255);
    expect(decodeBlurHash('LEHV6nWB', 4, 3), isNull);
    expect(decodeBlurHash('!!!!!!!', 4, 3), isNull);
  });
}
