import 'dart:typed_data';

import 'package:flutter/painting.dart';
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

  test('a box rounds up in eighths of the power of two under each side', () {
    expect(decodeBox(const Size(573, 860)), const Size(576, 896));
    expect(decodeBox(const Size(391, 586)), const Size(416, 640));
    expect(decodeBox(const Size(512, 512)), const Size(512, 512));
    expect(decodeBox(const Size(10, 0)), const Size(64, 64));
    // A box that grows by a pixel keeps its decode.
    expect(decodeBox(const Size(577, 860)), decodeBox(const Size(578, 861)));
  });

  test('a cover decodes large enough to fill both sides', () {
    // A still in a 16:9 card: the width decides.
    expect(
      decodeSize(const Size(960, 540), const Size(640, 352), BoxFit.cover),
      const Size(640, 360),
    );
    // A backdrop in a tall box: the height decides, not the width.
    expect(
      decodeSize(const Size(1920, 1080), const Size(400, 900), BoxFit.cover),
      const Size(1600, 900),
    );
    // A contain fits inside instead.
    expect(
      decodeSize(const Size(960, 540), const Size(400, 400), BoxFit.contain),
      const Size(400, 225),
    );
  });

  test('a decode is never larger than the picture, nor resized for little', () {
    expect(
      decodeSize(const Size(480, 720), const Size(960, 1440), BoxFit.cover),
      isNull,
    );
    expect(
      decodeSize(const Size(480, 720), const Size(448, 640), BoxFit.cover),
      isNull,
    );
    expect(
      decodeSize(const Size(480, 720), const Size(416, 640), BoxFit.cover),
      const Size(427, 640),
    );
    expect(decodeSize(Size.zero, const Size(100, 100), BoxFit.cover), isNull);
    expect(
      decodeSize(const Size(960, 540), const Size(100, 100), BoxFit.none),
      isNull,
    );
  });

  test('the image cache keeps a decode per box, not per frame', () {
    final loader = ArtworkLoader(
      MockClient((request) async => http.Response('', 404)),
      MemoryCache(),
    );
    final url = paths.artwork('a1');
    ArtworkImage at(double width) =>
        ArtworkImage.sized(url, loader, Size(width, width * 1.5));
    expect(at(390), at(400));
    expect(at(390), isNot(at(600)));
    expect(at(390), isNot(ArtworkImage(url, loader)));
  });
}
